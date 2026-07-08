---
# hordr-73jt
title: Milestone-level rollup after all epic merges
status: completed
type: task
priority: normal
created_at: 2026-07-08T08:44:01Z
updated_at: 2026-07-08T09:20:26Z
parent: hordr-5m0o
---

After each epic merges into the milestone branch, check if ALL the milestone's epic children are now completed. If so, mark the milestone bean completed (the rollup reached the root). This triggers fleet-finish eligibility.

## Summary of Changes

- Added areAllEpicsCompleted(milestoneId, deps) to src/dispatch/rollup.ts
- Checks if ALL the milestone's epic children are completed (precondition for milestone-level rollup)
- Returns false on empty (no epics) — a milestone with no epics isn't auto-completable
- Daemon calls this after each epic merge; if true → mark milestone completed → fleet finishable
- 3 new tests: all-complete, one-incomplete, no-epics
