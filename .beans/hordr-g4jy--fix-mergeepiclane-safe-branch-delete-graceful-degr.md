---
# hordr-g4jy
title: 'Fix mergeEpicLane: safe branch delete + graceful degradation'
status: completed
type: bug
priority: critical
created_at: 2026-07-16T14:14:03Z
updated_at: 2026-07-16T14:14:03Z
parent: hordr-4j5j
---

## Bug

mergeEpicLane used git branch -D (force-delete) and did not guard the
worktree removal or branch deletion with try/catch. If removeWorktreeByBranch
silently no-op-ed (worktree survived), git branch -D threw, the exception
propagated to scanFleet per-lane try/catch, and the lane stayed active
retrying the same failed operation every tick forever.

The -D flag also bypassed git branch -d merge verification -- if the
merge had silently failed (no-op), the branch ref would be force-deleted,
losing unmerged commits.

## Fix

1. -D changed to -d (safe delete from the fleet worktree on fleet.branch)
2. Worktree removal and branch deletion each wrapped in try/catch
3. On cleanup failure: log warning, mark lane done anyway, leave orphaned refs

## Tests

- branchDeleteFails behavior added to MockBehavior
- worktreeRemoveFails behavior added to MockBehavior
- Two new tests verify lane goes done even when cleanup fails
