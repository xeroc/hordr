---
# hordr-mhjs
title: Tick-driven lane scanner (lazy worktree creation)
status: completed
type: task
priority: high
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:58:22Z
parent: hordr-uye4
---

On each daemon tick: for each epic under the milestone, check if it has ready work (--ready ∩ epic subtree) AND no worktree exists. If so, create a worktree from the milestone integration branch (ms/<ms-id>, which auto-inherits earlier merged epics' code) and start a lane. This is the lazy-creation model — worktrees appear only when the epic is unblocked.

## Summary of Changes

- src/dispatch/scan.ts: scanForNewLanes(milestoneId, deps) — returns epics needing a lane
- Pure function: fetchEpics + hasReadyWork + laneExists injected
- Returns epics where ready work exists AND no lane yet (lazy worktree creation trigger)
- test/dispatch/scan.test.ts: 5 tests (new lane, all-blocked, all-have-lanes, no-epics, multiple-new)
