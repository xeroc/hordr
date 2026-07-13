---
# hordr-8di1
title: Inline pane.ts ensureLanePane into lane-create.ts
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-s725
---

pane.ts:102-113 ensureLanePane is 10 lines. Called once by lane-create.ts:49. The existingPaneId parameter is never passed (always undefined). The created: boolean return field is ignored by the caller.

Inline the 3-line body (if paneId exists → return it; else create) directly into createLaneForEpic. Delete ensureLanePane + EnsurePaneDeps.

If FleetEngine (epic 1) lands first, this is absorbed naturally.
