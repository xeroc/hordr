---
# hordr-g6jn
title: 'Refactor getDispatchable/dispatchNext scope: milestone → epic'
status: completed
type: task
priority: normal
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:56:20Z
parent: hordr-uye4
---

Minor rename: getDispatchable takes epicId (the subtree root) instead of milestoneId. dispatchNext context changes from {milestoneId, worktreePath, paneId} to {epicId, worktreePath, paneId}. The functions already work with any bean id as root — this is a calling-convention change, not a logic change.

## Summary of Changes

- getDispatchable: renamed param milestoneId → rootBeanId (generic subtree root)
- dispatchNext: renamed FleetContext → LaneContext, milestoneId → epicId
- Functions unchanged in logic — this is a calling-convention rename for the per-epic model
