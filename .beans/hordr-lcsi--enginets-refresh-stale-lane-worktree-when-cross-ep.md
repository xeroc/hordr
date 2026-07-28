---
# hordr-lcsi
title: 'engine.ts: refresh stale lane worktree when cross-epic blockers complete'
status: completed
type: bug
priority: high
created_at: 2026-07-20T08:20:26Z
updated_at: 2026-07-20T08:30:49Z
---

## Symptom

A lane sits idle showing "no dispatchable, epic status=todo" forever, even though `beans list --ready` from the milestone worktree shows tasks ready. Cascade: any downstream lane blocked-by this one also stalls.

## Root cause

Per-epic worktrees are independent checkouts. When task A in epic X is `--blocked-by` task B in epic Y, B is marked completed inside Y's worktree, committed to Y's branch, then merged into `ms/<id>`. **X's worktree never sees B's completion** unless `ms/<id>` is merged into X. ADR-0014's lazy-creation handles the INITIAL lane create (branches from current ms), but the engine has no mechanism to refresh an existing lane when ms advances.

## Fix

In `advanceLane`, right before the lane returns `idle` (epic not completed, no dispatchable work), do one cheap check: `getDispatchable(epic, ms_wt)`. If non-empty, the lane is stale — something ready upstream hasn't propagated. Try `git merge --ff-only ms/<id>` from inside the lane's worktree. On success, re-read dispatchable and dispatch. On ff-only failure (lane diverged), log a warning and stay idle (no broken state).

Precondition guard per Fabian: only merge when there IS real staleness — task ready in ms but not in lane wt. The `getDispatchable(epic, ms_wt) > 0` check IS that guard; it's computed before any git operation.

## Acceptance Criteria

- [ ] RED: idle lane with non-empty ms-side dispatchable does NOT trigger a merge today
- [ ] GREEN: engine issues `git merge --ff-only ms/<id>` from inside the lane worktree
- [ ] After successful merge, the lane dispatches the now-ready task
- [ ] ff-only failure is logged and the lane stays idle (no broken state)
- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [ ] existing tests still pass


## Summary of Changes

- `src/dispatch/engine.ts`: new top-level helper `refreshLaneIfStale(fleet, lane)` returning `refreshed|still-empty|diverged|no-work`. Detection = `getDispatchable(epic, ms_wt) > 0`. On detection: `git merge --ff-only ms/<id>` from inside the lane worktree. Ff-only refuses divergence (no broken state). Wired into `advanceLane` idle path — replaces the early `return {action: 'idle'}`.
- `test/dispatch/engine.test.ts`: new `scanFleet: cross-epic blocker refresh (hordr-lcsi)` describe block. Positive: lane stale (ms has ready, lane does not) → ff-merge fires, lane becomes ready, dispatch path exercised. Negative: nothing ready upstream → no merge.
- 334/334 tests pass, lint clean (4 pre-existing warnings only).
