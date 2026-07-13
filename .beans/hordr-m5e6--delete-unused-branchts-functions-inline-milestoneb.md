---
# hordr-m5e6
title: Delete unused branch.ts functions + inline milestoneBranchName
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-s725
---

- createMilestoneBranch: zero production callers (lifecycle.ts uses deps.createWorktree instead). Delete.
- milestoneBranchName: 1-liner identity function (return milestoneId). Called once in lifecycle.ts:81. Inline it.
- After inlining, delete branch.ts entirely if empty.
