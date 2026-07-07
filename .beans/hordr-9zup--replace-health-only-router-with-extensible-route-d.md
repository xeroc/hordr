---
# hordr-9zup
title: Replace /health-only router with extensible route dispatch
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:13:45Z
parent: hordr-ikft
---

daemon/server.ts currently hardcodes /health. Generalize: method+path → handler map, JSON in/out, unknown → 404. Keep /health working. Every route receives the project_key (resolved by CLI, sent as a field/header).

## Summary of Changes

- src/daemon/server.ts: extensible route registry (addRoute, resetRoutes, handleRequest with body)
- Built-in /health preserved; user routes added at daemon startup for broker endpoints
- createListener now async: reads + JSON-parses POST body, passes to handleRequest
- DaemonRequest interface: {method, path, body}
- test/daemon/server.test.ts: 4 new tests for route registration, body dispatch, resetRoutes
