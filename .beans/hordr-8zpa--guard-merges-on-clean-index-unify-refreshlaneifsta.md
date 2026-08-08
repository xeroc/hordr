---
# hordr-8zpa
title: Guard merges on clean index + unify refreshLaneIfStale merge path
status: completed
type: task
priority: high
created_at: 2026-08-08T18:22:01Z
updated_at: 2026-08-08T18:38:41Z
---

Two merge problems: (1) attemptMerge silently stashes uncommitted changes (messes with the index) and refreshLaneIfStale merges with no clean check at all — a dirty worktree can be clobbered or a merger agent spawned on top of uncommitted work. (2) refreshLaneIfStale reimplements the 3-tier merge inline (a second, inferior copy of attemptMerge). Fix: attemptMerge refuses a dirty worktree (return 'aborted', drop the stash); refreshLaneIfStale delegates to attemptMerge; finishFleet commits beans-dir dirt before the merge so the clean gate passes.

## Acceptance Criteria

- [ ] attemptMerge returns 'aborted' (NOT 'conflict') when the worktree has uncommitted changes — it never stashes
- [ ] attemptMerge no longer runs git stash at all (no stash push / stash pop)
- [ ] refreshLaneIfStale delegates to attemptMerge (no inline 3-tier merge)
- [ ] finishFleet commits beans-dir dirt before the merge so the clean gate passes
- [ ] mergeEpicLane / refreshLaneIfStale / finishFleet handle dirty-'aborted' by skipping (no teardown, no merger spawn, lane/fleet left as-is + logged)
- [ ] tests: attemptMerge clean-index refusal, no stash; refreshLaneIfStale uses attemptMerge; dirty-skip paths
- [x] lint (my files: 0 errors) + typecheck pass; pre-existing tui.ts lint errors unrelated

## Summary of Changes

**Problem 1 — dirty-index guard (all merge paths):**
- `attemptMerge` (merge.ts): dropped `git stash push`/`pop` entirely. Added a clean-index precondition (`isClean` dep) — returns `'aborted'` (never `'conflict'`, never touches the index) when the worktree has uncommitted changes. `restoreWorktree` no longer pops a stash (nothing to pop).
- `worktreeClean` (engine.ts) exported so the same beans-dir-aware verdict is reused by every caller — no second clean-check copy.
- Wired in: `mergeEpicLane` (epic→ms), `refreshLaneIfStale` (ms→lane), `finishFleet` (ms→primary, via the finish command).
- Dirty-`aborted` handling: engine skips the merge + leaves the lane active (retry next pass); `finishFleet` throws `FleetError` (manual command, fail loud).

**Problem 2 — one merge strategy:**
- `refreshLaneIfStale` (engine.ts) deleted its inline 3-tier merge (ff-only → no-ff → conflict, no stash, no clean check) and now delegates to `attemptMerge`. Exactly one 3-tier merge implementation remains.

**Tests (TDD, RED→GREEN):**
- `merge.test.ts`: dirty worktree → `'aborted'` (no git calls at all); `attemptMerge` never runs `git stash`; updated existing tests for the new `isClean` dep.
- `lifecycle.test.ts`: `finishFleet` refuses (no merge, no merger) when `isClean` returns false.
- `engine.test.ts`: `refreshLaneIfStale` skips the refresh merge when the lane is a real dirty git repo (no merge call, lane stays active).

**Note:** finishFleet's merge runs in mainRepoCwd (main repo), not the ms worktree — so no pre-merge beans commit is needed; beans-dir dirt in the main repo is excluded by `worktreeClean`'s policy.

**Pre-existing (not touched):** `src/commands/tui.ts` has 2 lint errors (hex-escape) from an uncommitted change already in the working tree before this task — unrelated.
