---
# hordr-24a3
title: Milestone-completion detection → mark fleet finishable
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:28:39Z
parent: hordr-nj9r
---

After rollup, if the milestone bean itself flipped to completed, mark the fleet row status=finishable so the human sees finish is green in fleet status. (The milestone completes via rollup reaching the root — no separate traversal.)

## Summary of Changes

- Added isMilestoneComplete(milestoneId, deps) to src/dispatch/rollup.ts
- Checks if the milestone bean's status is 'completed' (the rollup reached the root)
- The daemon calls this after rollup to mark the fleet finishable
- 2 new tests in test/dispatch/rollup.test.ts
