---
# hordr-s725
title: Delete 6 shallow modules (deletion test passes)
status: completed
type: epic
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T08:19:30Z
parent: hordr-sjue
---

Architecture review found 6 modules that pass the deletion test — deleting them concentrates complexity rather than moving it. Total: ~80 lines of scaffolding, zero behavior change.

| Module | Lines | Callers | Action |
|---|---|---|---|
| squash.ts | 25 | 0 prod, 1 test | Delete |
| lane.ts | 22 | 0 prod, 1 test | Delete |
| branch.ts createMilestoneBranch | ~10 | 0 | Delete |
| branch.ts milestoneBranchName | ~3 | 1 (identity) | Inline |
| pane.ts ensureLanePane | ~12 | 1 (ignores ½ result) | Inline |
| loop.ts dispatchNext | ~12 | 1 (2 adapters) | Inline |
