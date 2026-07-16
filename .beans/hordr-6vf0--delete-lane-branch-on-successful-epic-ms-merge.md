---
# hordr-6vf0
title: Delete lane branch on successful epic->ms merge
status: completed
type: bug
priority: high
created_at: 2026-07-16T12:44:22Z
updated_at: 2026-07-16T12:56:46Z
---

mergeEpicLane removes the lane worktree on a successful merge but leaves the lane's git branch ref behind as an orphan. After a successful merge into the milestone branch, the branch content is in fleet.branch and the ref is safe to delete.

Delete the lane branch too — but ONLY on a successful merge (not on conflict, not on a dirty worktree). Use git branch -D (force): from mainRepoCwd the lane branch isn't merged into HEAD, but mergeBranch already confirmed the merge into fleet.branch, so -D is the safe choice (mirrors engine.ts:170 / lifecycle.ts:247).

Implemented in two mirrors: advance.ts (injectable, exercised by the test helper) + engine.ts (production daemon path).

## Acceptance Criteria

- [ ] RED: on successful merge, the lane branch is deleted
- [ ] RED: on merge conflict, the branch is NOT deleted
- [ ] RED: on dirty worktree, the branch is NOT deleted
- [ ] GREEN: add removeBranch to AdvanceLaneDeps; call after removeWorktree in advance.ts mergeEpicLane
- [ ] GREEN: test helper wires removeBranch + removedBranches record
- [ ] GREEN: engine.ts mergeEpicLane mirrors with getGitRunner()(['branch','-D', lane.branch])
- [x] lint + typecheck clean

## Summary of Changes

- advance.ts: AdvanceLaneDeps gains removeBranch(branch); mergeEpicLane calls it right after removeWorktree, in the success-only path (conflict/dirty return early). Same gating the user asked for: only on a successful merge.
- tick.ts: TickDeps forwards removeBranch through advanceActiveLane.
- engine.ts (production daemon path): mergeEpicLane mirrors with getGitRunner()(['branch', '-D', lane.branch], {cwd: mainRepoCwd}) after removeWorktreeByBranch. -D (not -d) because from mainRepoCwd the lane branch isn't merged into HEAD; the merge into fleet.branch is already confirmed by mergeBranch returning no conflict.
- test helper: removedBranches record + removeBranch closure wired into both TickDeps and AdvanceLaneDeps builders.
- TDD: 3 RED assertions on the existing epic-completed scenarios (success deletes branch; conflict/dirty do not). 298 passing, lint/typecheck clean.
