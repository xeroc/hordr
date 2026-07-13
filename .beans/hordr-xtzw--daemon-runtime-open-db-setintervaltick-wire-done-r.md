---
# hordr-xtzw
title: 'Daemon runtime: open DB, setInterval(tick), wire /done route'
status: completed
type: task
priority: high
created_at: 2026-07-09T09:41:05Z
updated_at: 2026-07-09T10:15:10Z
parent: hordr-7hpb
blocked_by:
    - hordr-mtmu
---

Wire the broker into the running daemon: open openFleetDb on start, register POST /done route (handleDone + trigger rollup via the tick's advanceLane), setInterval to call tick(db, config, real deps) at a configurable interval (HORDR_TICK_MS, default e.g. 5000), keep signal handlers. The daemon command becomes the live broker. Tests for route registration + tick scheduling (fake timers).

## Summary of Changes

- `src/daemon/broker.ts`: `startBroker` (setInterval tick, swallow+log errors, stop handle), `doneRouteHandler` (wraps handleDone → /done route), `createTickDeps` (composes beans/git/herdr into TickDeps), `wireDaemon` (register /done + start loop), `tickIntervalMs` (HORDR_TICK_MS, default 5000)
- `src/commands/daemon.ts`: rewritten — openFleetDb, loadConfig, createTickDeps, wireDaemon (POST /done + tick loop), signals stop both server + broker
- `src/dispatch/dispatch.ts`: `fetchEpics`, `fetchAncestry` (walks task→feature→epic, stops at epic)
- `src/herdr/pane.ts`: `paneExists` (best-effort pane-list; trusts on error)
- `src/herdr/worktree.ts`: `removeWorktreeByBranch` (open+remove, tolerant of gone)
- spawn seam: advanceLane binds lane.paneId into spawn (TickDeps.spawn now takes {harness, paneId, prompt})
- Tests: startBroker scheduling + error recovery, doneRouteHandler (400/200/409), fetchEpics, fetchAncestry (task→feature→epic + direct-under-epic)

Note: markCompleted is a no-op in the broker (hordr stays read-only on beans — ADR-0012); rollup is observed by the next tick via epicStatus. Bean-status writes remain the member's/human's job.
