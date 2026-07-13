---
# hordr-k9wi
title: Update daemon.ts to create FleetEngine
status: todo
type: task
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T06:36:33Z
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
