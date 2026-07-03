---
# hordr-kxpq
title: 'Slice 6: CLI advance proxy to daemon (fallback direct)'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:30Z
updated_at: 2026-07-01T13:36:34Z
parent: hordr-4j5j
---

Slice 6: CLI advance proxy to daemon (fallback direct)

## Summary

- src/daemon/client.ts: daemonAlive (socket probe), postToDaemon (POST over unix socket), DaemonClientError.
- src/commands/advance.ts: rewritten as async; advanceOne tries daemon, falls back to direct engine call. Output now includes via=.
- test/commands/advance.test.ts: rewritten for new shape; sets HORDR_SOCKET to nonexistent path so direct fallback fires.
