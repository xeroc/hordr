---
# hordr-mtmu
title: 'tick: one pass over all active fleets'
status: completed
type: task
priority: high
created_at: 2026-07-09T09:40:50Z
updated_at: 2026-07-09T10:00:22Z
parent: hordr-7hpb
blocked_by:
    - hordr-fum6
    - hordr-fl2c
---

Pure function tick(db, config, deps): for each active fleet (listFleets where status=active): scanForNewLanes -> createLaneForEpic for each; then advanceLane for each active lane. Composes createLaneForEpic + advanceLane. Also add listFleets(status) to the store. Tests with in-memory db + mocked deps.

## Summary of Changes

- `src/dispatch/tick.ts`: `tick(db, deps)` — one pass over all active fleets: scanForNewLanes → createLaneForEpic (skips epics with an existing lane), then advanceLane for each 'active' lane; skips non-active lanes (conflict/done) and non-active fleets
- `src/storage/fleets.ts`: `listFleets(db, {status?})` for the tick's fleet iteration
- Tests: scan+create+dispatch end-to-end; scan skips existing lanes; conflict lanes skipped; non-active fleets ignored

Pure against the DB + injected I/O. The daemon (hordr-xtzw) calls it on an interval.
