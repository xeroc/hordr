---
# hordr-m5e6
title: Delete unused branch.ts functions + inline milestoneBranchName
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T08:10:12Z
parent: hordr-s725
---

- createMilestoneBranch: zero production callers (lifecycle.ts uses deps.createWorktree instead). Delete.
- milestoneBranchName: 1-liner identity function (return milestoneId). Called once in lifecycle.ts:81. Inline it.
- After inlining, delete branch.ts entirely if empty.

## Summary of Changes

- Deleted `src/dispatch/branch.ts` (both `createMilestoneBranch` and `milestoneBranchName`).
- Inlined `milestoneBranchName(milestoneId)` → `milestoneId` at the single call site (`src/fleet/lifecycle.ts`).
- Relocated `GitFn` import in lifecycle.ts to `dispatch/merge.js` (already a dependency; identical type).
- Deleted `test/dispatch/branch.test.ts` (covered only the deleted code).
- Updated AGENTS.md and README.md module trees.

Verification: `tsc --noEmit` clean, full suite 247 passing / 0 failing.
