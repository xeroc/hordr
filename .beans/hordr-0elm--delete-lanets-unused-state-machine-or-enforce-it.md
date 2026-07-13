---
# hordr-0elm
title: Delete lane.ts (unused state machine) or enforce it
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:19:11Z
parent: hordr-s725
---

lane.ts exports canTransition + VALID_TRANSITIONS + LaneStatus type. Zero production callers. Status is mutated via raw strings: advance.ts:145 does deps.updateLaneStatus(loc, 'conflict') — the state machine is never consulted.

Two options:
1. Delete lane.ts entirely — the type is documentation, the enforcement never existed.
2. Actually enforce: updateLaneStatus calls canTransition and throws on invalid transitions.

Recommendation: delete. The transitions are simple enough to verify by reading advance.ts. If enforcement is needed later, it belongs inside FleetEngine.updateLaneStatus, not as a standalone module.

## Summary of Changes

Deleted `src/dispatch/lane.ts` (the unused `canTransition` / `VALID_TRANSITIONS` / `LaneStatus` state machine — zero production callers, status was mutated via raw strings through `updateLaneStatus` in `src/storage/fleets.ts`).

- Removed `src/dispatch/lane.ts` (22 lines)
- Removed `test/dispatch/lane.test.ts` (unit test for the deleted module)
- Trimmed `test/dispatch/lane-integration.test.ts`: dropped the `canTransition` import + the two decorative trailing assertions; the real integration characterization (scan → dispatch → heal → rollup) is preserved and passes 3/3
- Updated `README.md` and `AGENTS.md` to drop the `lane.ts` entry from the dispatch module map

Verification: `tsc --noEmit` clean; `eslint` 0 errors (3 pre-existing warnings in untouched files); dispatch suite 76 pass / 5 fail where the 5 failures are pre-existing `better-sqlite3` native binding load errors in `tick.test.ts`, unrelated to this change.

Skipped: enforcement inside `FleetEngine.updateLaneStatus`. Add when invalid lane transitions actually cause a bug — the transitions are simple enough to verify by reading advance.ts for now.
