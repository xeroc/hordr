---
# hordr-7q3b
title: 'Slice 3: HTTP daemon (unix socket) - /complete /fail /status /health'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:30Z
updated_at: 2026-07-01T13:15:16Z
parent: hordr-4j5j
---

Slice 3: HTTP daemon (unix socket) - /complete /fail /status /health

## Summary

- src/daemon/socket.ts: socketPath() (HORDR_SOCKET or ~/.hordr/hordr.sock).
- src/daemon/server.ts: handleRequest (pure router) + startServer + installSignalHandlers.
- Routes: GET /health, /status/<bean>; POST /complete, /advance, /fail, /resume.
- test/daemon/server.test.ts: 11 tests (unit + unix-socket integration).
