---
# hordr-mef5
title: Create FleetEngine module (src/dispatch/engine.ts)
status: completed
type: task
priority: critical
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T07:42:00Z
parent: hordr-7nsz
---

Create src/dispatch/engine.ts with:

```typescript
export interface FleetEngine {
  /** One broker pass over all active fleets. Safe to call on an interval. */
  scanFleet(db: Database): TickResult
  /** Advance one lane by one step. */
  advanceLane(db: Database, fleet: FleetRow, lane: LaneRow): AdvanceResult
}

export function createFleetEngine(config: HordrConfig, mainRepoCwd: string): FleetEngine
```

The implementation absorbs:
- tick.ts: the scan loop + lane-advance loop + lane recovery + per-lane try/catch
- advance.ts: the idle/dispatch/heal/rollup/merge state machine
- The per-fleet/per-lane depsFactory logic (create deps scoped to fleet.worktreePath for scan, lane.worktreePath for advance)

Internal helpers (not exported): resolveBeansDir, commitBeans, createWorktreeWithRecovery, etc.

**Key invariant:** FleetEngine holds mainRepoCwd (for herdr ops) and config (for agents/harness). Per-fleet/per-lane cwd is resolved internally from the fleet/lane rows in the DB.

**Test:** createFleetEngine returns an object with exactly 2 methods. Internally composes all existing modules (dispatch.ts, heal.ts, rollup.ts, merge.ts, spawn.ts, etc.) — those modules stay as-is, just called from inside the engine instead of through TickDeps forwarding.

## Summary of Changes

- **src/dispatch/engine.ts** (new): `FleetEngine` interface + `createFleetEngine(config, mainRepoCwd)` factory. Holds config + mainRepoCwd; resolves per-fleet/per-lane cwd from DB rows. Absorbs the tick scan loop + lane-advance loop + worktree recovery + per-lane try/catch (from tick.ts) and the idle/dispatch/heal/rollup/merge state machine (from advance.ts), calling leaf modules (dispatch, heal, rollup, merge, spawn, scan, lane-create, loop) directly instead of through TickDeps forwarding. Internal helpers: `resolveBeansDir`, `commitBeans`, `createWorktreeWithRecovery`, `rollupSweep`, `rollupAncestors`.
- **test/dispatch/engine.test.ts** (new): verifies `createFleetEngine` returns an object with exactly 2 methods (scanFleet, advanceLane).
- No changes to existing modules — tick.ts, advance.ts, broker.ts untouched (daemon rewiring to use the engine is follow-up work).
