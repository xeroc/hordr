---
# hordr-50f9
title: Filter dispatchable set to task/bug types only
status: completed
type: task
priority: high
created_at: 2026-07-08T19:12:57Z
updated_at: 2026-07-08T19:20:00Z
---

getDispatchable currently has no type filter — features, epics, milestones in --ready would be picked for dispatch. Add type ∈ {task, bug} filter. Features are containers, not executable.

## Summary of Changes

- Added type field to DispatchableBean interface
- EXECUTABLE_TYPES = new Set(['task', 'bug']) filter in pickDispatchable
- Features, epics, milestones in --ready are now excluded from dispatch
- flattenDescendants carries type from the tree query
- 1 new test: feature/epic/milestone exclusion + bug inclusion
- Updated all mock data across dispatch/loop/lane-integration tests with type field
