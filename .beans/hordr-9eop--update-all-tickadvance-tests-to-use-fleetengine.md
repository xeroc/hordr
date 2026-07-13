---
# hordr-9eop
title: Update all tick/advance tests to use FleetEngine
status: completed
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T08:05:17Z
parent: hordr-7nsz
---

- tick.test.ts: replace `tick(db, () => ({...17 fields}))` with `engine.scanFleet(db)` where engine is a real FleetEngine backed by mocks.
- advance.test.ts: replace `advanceLane(opts, deps)` with `engine.advanceLane(db, fleet, lane)`.
- The test mock implements the 2-method FleetEngine interface, not 17 closures.

Create a TestFleetEngine in test/helpers/ that:
- Uses in-memory beans (canned responses)
- Records git calls
- Records spawn calls
- Records merge calls
- No global mutables to reset

This eliminates the need for _setShellForTesting in dispatch.ts, beans/client.ts, etc. — the test goes through the engine interface, not the module globals.

## Summary of Changes

- **test/helpers/fleet-engine.ts** (new): TestFleetEngine — wraps the pure tick()/advanceLane() functions with mock I/O. Accepts canned bean data (MockFleetData) + behavior overrides (MockBehavior). Returns a real FleetEngine (2-method interface: scanFleet + advanceLane) + FleetEngineRecords (records spawn, merge, worktree creation/removal, git commits, marked-completed, factory cwds). No global mutables — each instance holds its own state.
- **test/dispatch/tick.test.ts** (rewritten): replaced tick(db, () => ({...17 fields})) with engine.scanFleet(db) via createTestFleetEngine. Same 5 test cases, now through the FleetEngine interface.
- **test/dispatch/advance.test.ts** (rewritten): replaced advanceLane(opts, deps) with engine.advanceLane(db, fleet, lane) via createTestFleetEngine. Same 7 test cases. Uses real in-memory DB for lane mutations (verified via DB queries instead of a state object).
