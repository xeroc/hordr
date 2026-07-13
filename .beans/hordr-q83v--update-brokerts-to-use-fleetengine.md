---
# hordr-q83v
title: Update broker.ts to use FleetEngine
status: todo
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T06:36:33Z
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
