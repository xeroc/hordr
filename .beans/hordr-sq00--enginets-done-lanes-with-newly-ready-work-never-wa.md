---
# hordr-sq00
title: 'engine.ts: done lanes with newly-ready work never wake up'
status: completed
type: bug
priority: high
created_at: 2026-07-20T06:44:46Z
updated_at: 2026-07-20T06:57:00Z
---

## Symptom

`hordr fleet check` shows `lane X: status=done (skip)` for epics that still have `todo` tasks whose `--blocked-by` dependencies have since completed. The lane was prematurely closed and never re-evaluated. Tasks stay stuck forever.

## Root cause

`tick.ts:115-127` has a cleanup that deletes a `done` lane row when its epic isn't `completed` AND has ready work — so `scanForNewLanes` recreates a fresh lane next pass. That cleanup was never ported to `engine.ts`, which is the production path (ADR-0015). `engine.ts:472-475` skips every non-active lane unconditionally.

Observed on fleet `zeroclaw-solana-bounty-jkjl`: lanes `p4vf` and `eeh4` went `done` while their refactor tasks (blocked-by foundation epic) were still blocked. Foundation merged → refactor tasks became ready → lanes stayed `done` → nothing dispatched. Cascade also blocked `ig4u` (its tasks blocked-by p4vf/eeh4).

## Fix

Port the 8-line stale-done-lane cleanup from `tick.ts:115-127` into `engine.ts` just before line 472. TDD: failing test first in `test/dispatch/engine.test.ts`.

## Acceptance Criteria

- [ ] RED: test in `test/dispatch/engine.test.ts` reproduces the skip (done lane with ready work stays in DB)
- [ ] GREEN: after fix, the stale done lane row is deleted by scanFleet
- [ ] Port the cleanup logic; no new abstractions
- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [x] existing engine tests still pass (330/330)


## Summary of Changes

- `src/dispatch/engine.ts`: added stale-done-lane cleanup at the top of the lane loop (hordr-sq00). When a lane is `done` but its epic isn't `completed` AND `getDispatchable(epic)` returns ready work, the lane row is deleted via `deleteLanesByEpic` so `scanForNewLanes` recreates a fresh lane on the next `scanFleet` pass. Ports the existing `tick.ts:115-127` logic into the production engine.
- `test/dispatch/engine.test.ts`: new `scanFleet: stale done lane cleanup (hordr-sq00)` describe block with one RED→GREEN test that exercises the cleanup through the real `createFleetEngine` + `scanFleet` path with mocked beans shells.
