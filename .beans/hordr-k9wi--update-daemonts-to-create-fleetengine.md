---
# hordr-k9wi
title: Update daemon.ts to create FleetEngine
status: completed
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T09:17:38Z
parent: hordr-7nsz
---

daemon.ts run() changes from:
```typescript
const depsFactory = createTickDepsFactory(config, cwd)
wireDaemon({db, depsFactory, ...})
```
to:
```typescript
const engine = createFleetEngine(config, cwd)
wireDaemon({db, engine, ...})
```

Keep: --foreground, --log-level flags, configureLogger, loadConfig, openFleetDb, startServer, installSignalHandlers.

## Summary of Changes

- src/commands/daemon.ts: swap createTickDepsFactory(config) for createFleetEngine(config, cwd); pass engine to wireDaemon instead of depsFactory. Drop createTickDepsFactory import, add createFleetEngine import from ../dispatch/engine.js. Imports kept alphabetical.
- broker.ts (minimal coupled change to keep tree green): startBroker + wireDaemon signatures swap depsFactory → engine: FleetEngine; the tick loop now calls engine.scanFleet(db) instead of tick(db, factory). FleetEngine type imported from dispatch/engine.js. Unused tick() import dropped. createTickDepsFactory + TickDeps/TickDepsFactory types KEPT (deleting them is hordr-q83v's scope).
- test/daemon/broker.test.ts: the two startBroker tests pass an engine mock ({scanFleet}) instead of a depsFactory stub. The createTickDepsFactory.markCompleted test is untouched (the function still exists).

These two beans (hordr-k9wi daemon + hordr-q83v broker) are atomically coupled for green commits — daemon.ts passing engine cannot typecheck unless wireDaemon accepts it. This commit makes the minimal signature swap so the tree stays green; hordr-q83v still owns deleting createTickDepsFactory + shrinking the test suite.

Verified: tsc --noEmit clean, eslint 0 errors (3 pre-existing warnings in untouched files), mocha 248 passing.
