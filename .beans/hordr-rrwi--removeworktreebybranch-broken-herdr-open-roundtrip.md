---
# hordr-rrwi
title: |-
    removeWorktreeByBranch broken: herdr open roundtrip fails with linked_worktree_source and open worktree actions start from the repo parent workspace.}}
    ```

    Root cause: removeWorktreeByBranch does a two-step herdr roundtrip (open → resolve workspace_id → remove). Two bugs:
    1. `git rev-parse --git-common-dir` returns relative `.git` when cwd IS the main repo → path.dirname('.git') = '.' → `--cwd .` resolves against herdr's own process cwd (the daemon's), not the repo.
    2. Unnecessary roundtrip: we already have lane.worktreePath. `git worktree remove <path>` is one call, no herdr, no cwd dance.

    Same broken helper is wired into finishFleet (hordr-ph01) — also affected.

    ## Plan (TDD)

    - [ ] RED: tests for new removeWorktreeByPath(worktreePath) in test/herdr/worktree.test.ts
    - [ ] GREEN: replace removeWorktreeByBranch with removeWorktreeByPath (git worktree remove, NO --force, tolerant of already-gone, git seam for tests)
    - [ ] Migrate engine.ts:255 caller (mergeEpicLane) — pass lane.worktreePath; safety gates (dirty check @240, epic-completed @298 caller) already in place
    - [ ] Migrate finish.ts:58 + finishFleet dep signature (lifecycle.ts) to take worktreePath
    - [ ] Drop now-dead removeWorktreeByBranch export
    - [ ] lint + typecheck + full test suite green
    - [ ] Update hordr-ph01 (shared helper fix supersedes its wiring)
status: completed
type: bug
priority: high
created_at: 2026-07-17T11:28:52Z
updated_at: 2026-07-17T11:47:50Z
---

## Problem

`hordr fleet check` epic-completion cleanup (engine.ts mergeEpicLane → removeWorktreeByBranch) fails:

```
herdr worktree open --json --cwd . --branch tributary-s16v failed
{error:{code:linked_worktree_source,message:New

## Summary of Changes

**Root cause:** `removeWorktreeByBranch` roundtripped through `herdr worktree open` to resolve a workspace_id from the branch. It computed the main-repo cwd via `git rev-parse --git-common-dir`, which returns the relative `.git` when cwd IS the main repo, so `path.dirname(".git")` = "." and `herdr worktree open --cwd .` resolved "." against herdr's own process cwd (the daemon's) — hence `linked_worktree_source`. The merge had already landed; only the worktree teardown crashed.

**Fix:** replaced the branch-based herdr-roundtrip helper with `removeWorktreeByPath(worktreePath)` — a direct `git worktree remove <path>` (NO --force, no herdr, no cwd dance). The path is already in hand (lane.worktreePath / fleet.worktreePath). Git's own dirty-worktree refusal is the final safety net (hordr-wd46).

**Safety gates (already in place at callers, re-confirmed):**
- engine.ts mergeEpicLane: dirty-non-beans check (L240) + epic-completed check (caller advanceLane L298) both run before the remove.
- lifecycle.ts finishFleet: isMilestoneComplete + areAllEpicsCompleted both run before the remove.
No --force is ever passed in these paths. abort --force keeps its own local helper (explicit discard, separate semantics).

**Call sites migrated:**
- src/herdr/worktree.ts: removeWorktreeByBranch -> removeWorktreeByPath (+ new _git test seam; dropped dead path import).
- src/dispatch/engine.ts: mergeEpicLane calls removeWorktreeByPath(lane.worktreePath); dropped now-orphaned mainRepoCwd.
- src/fleet/lifecycle.ts: FinishFleetDeps.removeWorktree signature (branch) -> (worktreePath); finishFleet guards on fleet.worktreePath.
- src/commands/fleet/finish.ts: wires removeWorktreeByPath.

**TDD:** RED first (5 tests for removeWorktreeByPath: no-force args, no herdr roundtrip, empty-path error, tolerate-already-gone, rethrow other errors), then GREEN. 322 passing, 0 failing. typecheck clean. 0 lint errors (4 pre-existing warnings untouched). All acceptance criteria met.
