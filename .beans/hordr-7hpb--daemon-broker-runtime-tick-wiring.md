---
# hordr-7hpb
title: Daemon broker runtime (tick wiring)
status: todo
type: epic
priority: high
created_at: 2026-07-09T09:40:24Z
updated_at: 2026-07-09T09:40:24Z
parent: hordr-nh1h
---

Compose the existing pure dispatch functions (scanForNewLanes, dispatchNext, checkInvocation, rollup, mergeBranch) into a running daemon tick loop, plus wire the /done route. The pure building blocks exist; this epic is the runtime composition. See ADRs 0010/0012/0014.
