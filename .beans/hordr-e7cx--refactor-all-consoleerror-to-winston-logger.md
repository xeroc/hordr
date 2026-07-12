---
# hordr-e7cx
title: Refactor all console.error to winston logger
status: completed
type: task
priority: normal
created_at: 2026-07-12T19:25:17Z
updated_at: 2026-07-12T19:35:39Z
parent: hordr-ikft
blocked_by:
    - hordr-z4uy
---

After winston is set up, replace every console.error call in src/dispatch/tick.ts, src/dispatch/advance.ts, and src/daemon/broker.ts with the winston logger at the appropriate level. See hordr-z4uy for the level mapping. Remove console.error entirely — no raw console calls in dispatch code.

## Summary

- All console.error in tick.ts (5), advance.ts (11), broker.ts (1) replaced with logger calls
- Level mapping: scan details=debug, lane lifecycle=info, merge conflict=error, stuck=warn
- Zero console.error calls remain in dispatch code
