---
# hordr-xc22
title: Unify GitFn type — one definition, not four
status: completed
type: epic
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:44:23Z
parent: hordr-sjue
---

GitFn is defined identically in 3 files + aliased as GitRunner in a 4th:
- merge.ts:15 — export type GitFn
- squash.ts:12 — export type GitFn (being deleted in epic 2)
- branch.ts:8 — export type GitFn (being deleted in epic 2)
- runtime.ts:20 — export type GitRunner (same shape)

After epic 2 deletes squash.ts and branch.ts, only merge.ts and runtime.ts remain. Consolidate to one export in runtime.ts, import everywhere.

If FleetEngine (epic 1) lands, GitFn becomes internal to the engine — the test mock replaces the whole engine, not individual git calls.
