---
# hordr-0elm
title: Delete lane.ts (unused state machine) or enforce it
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-s725
---

lane.ts exports canTransition + VALID_TRANSITIONS + LaneStatus type. Zero production callers. Status is mutated via raw strings: advance.ts:145 does deps.updateLaneStatus(loc, 'conflict') — the state machine is never consulted.

Two options:
1. Delete lane.ts entirely — the type is documentation, the enforcement never existed.
2. Actually enforce: updateLaneStatus calls canTransition and throws on invalid transitions.

Recommendation: delete. The transitions are simple enough to verify by reading advance.ts. If enforcement is needed later, it belongs inside FleetEngine.updateLaneStatus, not as a standalone module.
