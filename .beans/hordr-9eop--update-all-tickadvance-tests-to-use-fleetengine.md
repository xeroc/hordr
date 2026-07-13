---
# hordr-9eop
title: Update all tick/advance tests to use FleetEngine
status: todo
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T06:36:33Z
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
