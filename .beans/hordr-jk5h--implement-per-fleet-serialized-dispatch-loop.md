---
# hordr-jk5h
title: Implement per-fleet serialized dispatch loop
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:17:00Z
parent: hordr-ikft
---

One timer + one promise-chain per active fleet on the Node event loop. Within a fleet: strict serialization (one invocation at a time). Across fleets: independent. Loop body: getDispatchable → spawn → wait for /done or self-heal → rollup → check milestone complete → repeat. Crash-safe: re-derive fleet state from SQLite + beans on restart.

## Summary of Changes

- src/dispatch/loop.ts: dispatchNext(ctx, config, deps) — pure orchestrator
- Ties getDispatchable + resolveRole + buildInvocationPrompt + spawnInvocation into one step
- Dependencies injected (fetchDispatchable, fetchBean, spawn) for testability — daemon wires real I/O
- Returns {dispatched, beanId, role} or {dispatched: false} when no work
- test/dispatch/loop.test.ts: 3 tests (priority pick + role resolution, empty, body inclusion)
