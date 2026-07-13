---
# hordr-vdww
title: Inline loop.ts dispatchNext into advance.ts
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-s725
---

loop.ts (47 lines) exports dispatchNext, called once from advance.ts:125. The caller adapts signatures both ways:
- fetchDispatchable: advance.ts closes over an already-fetched array → loop.ts receives () => DispatchableBean[]
- spawn: advance.ts adapts (harness, prompt) → {harness, paneId, prompt}

Inline the 7-line body of dispatchNext directly into advance.ts where it's called. Remove loop.ts + loop.test.ts. Remove DispatchDeps interface.

If FleetEngine (epic 1) lands first, this is absorbed naturally — dispatchNext becomes a private method of the engine.
