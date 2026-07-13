---
# hordr-q83v
title: Update broker.ts to use FleetEngine
status: completed
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T09:29:14Z
parent: hordr-7nsz
---

Replace createTickDepsFactory + wireDaemon + startBroker with:

```typescript
export function wireDaemon(opts: {
  db: Database
  engine: FleetEngine
  intervalMs?: number
  verifyCompleted: (taskId: string) => boolean
}): BrokerHandle
```

The broker's tick loop becomes: `engine.scanFleet(opts.db)` — no deps factory, no 17 closures.

Remove: TickDepsFactory type, TickDeps interface usage, the 17-closure createTickDepsFactory function.
Keep: doneRouteHandler (the /done socket route), tickIntervalMs, startBroker's try/catch + setInterval.

**Test:** broker.test.ts mocks FleetEngine (2 methods) instead of TickDepsFactory (returns 17-field object). Tests shrink dramatically.

## Summary of Changes

- Removed the 17-closure `createTickDepsFactory` and its `mainRepoFromWorktree` helper from `src/daemon/broker.ts`; dropped all imports that only supported them (child_process, fs, path, yaml, beans/client, dispatch modules, herdr wrappers, runtime).
- Removed the `TickDeps`/`TickDepsFactory` imports from broker.ts.
- Consolidated `startBroker` + `wireDaemon` into a single `wireDaemon(opts)` that takes `{db, engine, intervalMs?, verifyCompleted}`; the tick loop is now `opts.engine.scanFleet(opts.db)` inside the kept try/catch + `setInterval`. Removed the injectable `tickFn` parameter.
- Kept `doneRouteHandler`, `tickIntervalMs`, and `BrokerHandle` unchanged.
- Shrunk `test/daemon/broker.test.ts`: deleted the `createTickDepsFactory.markCompleted` block; rewrote the interval tests to mock `FleetEngine` (2 methods) instead of injecting `tickFn`; added `resetRoutes()` afterEach to stop `addRoute('POST', '/done')` leaking across test files.
- Net: broker.ts 156 → 49 lines; broker.test.ts 146 → 122 lines; test count 248 → 247 (one deleted).
