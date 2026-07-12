---
# hordr-z4uy
title: Add winston logging with --log-level flag
status: completed
type: task
priority: high
created_at: 2026-07-12T19:25:03Z
updated_at: 2026-07-12T19:35:39Z
parent: hordr-ikft
---

Replace console.error with winston logger. Add --log-level flag to hordr daemon (debug, info, warn, error — default info). Winston transports: Console (colorized, timestamped) when foreground; no transport when detached (logs suppressed). Configure in a shared logger module (src/logger.ts) so all dispatch/tick/broker modules import from one place. Levels: error (merge conflicts, crashes), warn (lane stuck, pane gone), info (lane created, task dispatched, epic merged), debug (per-tick scan details, per-epic ready/not-ready, rollup marks).

## Summary

- src/logger.ts: winston logger with configureLogger({level, silent})
- Levels: error/warn/info/debug. Default info. Silent when detached.
- Console transport with timestamp + colorize format
