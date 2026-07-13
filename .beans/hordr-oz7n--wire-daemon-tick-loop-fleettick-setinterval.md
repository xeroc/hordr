---
# hordr-oz7n
title: 'Wire daemon tick loop: fleetTick + setInterval'
status: completed
type: task
priority: critical
created_at: 2026-07-10T10:29:02Z
updated_at: 2026-07-10T10:44:52Z
---

The daemon serves routes but never actively dispatches. Build fleetTick (composes scanForNewLanes + dispatchNext + checkInvocation + rollup + squashRollup per active fleet/lane) and wire it into the daemon via setInterval. This is the last gap before a fleet actually dispatches agents.

## Summary of Changes

- Fixed per-fleet cwd bug: createTickDeps(config, cwd) → createTickDepsFactory(config) returning (cwd) => TickDeps
- tick() now takes a depsFactory instead of fixed deps; creates per-fleet deps using fleet.worktreePath
- This fixes the multi-project daemon: each fleet's beans queries now run in the fleet's project directory
- Updated broker.ts (startBroker, wireDaemon), daemon.ts, tick.test.ts, broker.test.ts
- New test: verifies factory is called with fleet.worktreePath
- 264 tests, 0 failing
