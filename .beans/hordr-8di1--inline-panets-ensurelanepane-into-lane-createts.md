---
# hordr-8di1
title: Inline pane.ts ensureLanePane into lane-create.ts
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:29:17Z
parent: hordr-s725
---

pane.ts:102-113 ensureLanePane is 10 lines. Called once by lane-create.ts:49. The existingPaneId parameter is never passed (always undefined). The created: boolean return field is ignored by the caller.

Inline the 3-line body (if paneId exists → return it; else create) directly into createLaneForEpic. Delete ensureLanePane + EnsurePaneDeps.

If FleetEngine (epic 1) lands first, this is absorbed naturally.

## Summary of Changes

- Inlined the 3-line body of ensureLanePane into createLaneForEpic (src/dispatch/lane-create.ts:47-51). The existingPaneId branch was dead at this callsite (always undefined), so the inline is a single deps.createPane call.
- Deleted src/dispatch/pane.ts (48 lines), test/dispatch/pane.test.ts (45 lines), and the ensureLanePane import.
- Coverage preserved: lane-create.test.ts already asserted the exact pane create call (label `hordr:<epic>`, cwd=worktreePath, workspaceId) — the deleted pane.test.ts was redundant.
