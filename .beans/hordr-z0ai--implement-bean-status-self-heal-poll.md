---
# hordr-z0ai
title: Implement bean-status self-heal poll
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:21:30Z
parent: hordr-ikft
---

Per-tick (default 5s): for the current fleet's active invocation, check bean status in the worktree. If completed without /done → proceed as if /done arrived. Also check pane-gone (herdr pane get); if gone AND bean not completed → mark task blocked, continue. No wall-clock timeouts ever.

## Summary of Changes

- src/dispatch/heal.ts: checkInvocation(opts, deps) — self-heal poll logic
- Two checks: bean completed → proceed; pane gone + not completed → blocked; else → wait
- No timeouts, no wall-clock judgment (ADR-0010)
- Pure function with injected deps (beanStatus, paneAlive)
- test/dispatch/heal.test.ts: 5 tests including the no-timeout invariant
