---
# hordr-7nsz
title: Collapse TickDeps + AdvanceLaneDeps into FleetEngine
status: todo
type: epic
priority: critical
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T06:36:33Z
parent: hordr-sjue
---

The core refactor. TickDeps (17 fields, tick.ts:26-56) and AdvanceLaneDeps (16 fields, advance.ts:26-46) are the same object in practice. tick.ts:185-202 is a 17-line destructuring forwarder that adds zero logic. Adding a dep requires editing 3 files with no compiler help.

**Current shape:**
```
broker.ts createTickDepsFactory → 17 closures
  ↓ threads all 17 ↓
tick.ts TickDeps (17 fields)
  ↓ forwards 16 of 17 ↓
advanceActiveLane (17-line pass-through)
  ↓ ↓
advance.ts AdvanceLaneDeps (16 fields)
```

**Target shape:**
```
broker.ts createFleetEngine(config, mainRepoCwd) → FleetEngine
  ↓ returns one object ↓
FleetEngine
  - scanFleet(db) → TickResult
  - advanceLane(db, lane) → AdvanceResult
  internal: dispatch, heal, rollup, merge, commit, createPane, createWorktree
```

**Bug history proving the need:**
- markCompleted was a no-op (broker wiring, pure rollup worked)
- commitBeans hardcoded wrong path (broker wiring)
- createWorktree duplicated recovery logic (broker vs runtime.ts)
- per-fleet cwd + per-lane cwd both fixed in wiring (tick.ts)

All bugs in the wiring. Zero in pure functions.
