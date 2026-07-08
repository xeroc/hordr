---
# hordr-rdr8
title: Lane lifecycle state machine
status: completed
type: task
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:53:03Z
parent: hordr-uye4
---

pending (epic blocked, no worktree) → active (worktree created, dispatching) → merging (epic done, merging to milestone) → conflict (merge conflict, human needed) | done (merged, worktree removed). State transitions driven by the tick handler.

## Summary of Changes

- src/dispatch/lane.ts: LaneStatus type + VALID_TRANSITIONS map + canTransition(from, to)
- 5 statuses: pending → active → merging → done | conflict → done
- Guards: pending can't skip to merging; active can't skip to done; done is terminal
- test/dispatch/lane.test.ts: 9 tests (all valid transitions, key invalid ones, terminal guard)
