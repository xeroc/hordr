---
# hordr-zqwo
title: Quarantine fleet when ms worktree is removed (no more violent brick)
status: completed
type: bug
priority: high
created_at: 2026-07-16T11:32:04Z
updated_at: 2026-07-16T11:42:36Z
---

scanFleet crashes when fleet.worktreePath is gone: fetchEpics -> defaultShell throws (beans can't run in a non-existent cwd). The throw aborts the whole tick, stalling every healthy fleet sharing the daemon. Guard at the top of the fleet loop: if the ms worktree is missing, mark fleet status 'broken' so listFleets({status:'active'}) skips it going forward.

## Acceptance Criteria

- [ ] RED: test asserting scanFleet does not throw when fleet.worktreePath is missing; fleet marked 'broken'; beans shell not called
- [ ] RED: test asserting a broken fleet does not abort scanning of other healthy fleets
- [ ] GREEN: add updateFleetStatus to storage/fleets.ts
- [ ] GREEN: guard in engine.ts scanFleet (existsSync check before fetchEpics)
- [x] lint + typecheck clean

## Summary of Changes

- storage/fleets.ts: added updateFleetStatus(db, projectKey, milestoneId, status) — mirrors updateLaneStatus.
- dispatch/engine.ts scanFleet: guard at the top of the per-fleet loop (after the mainRepoCwd null-check, before fetchEpics). When !existsSync(fleet.worktreePath): logs a recovery hint, sets fleet status to 'broken', and continues. listFleets({status:'active'}) then skips it on every future tick.
- Why fleet-level (not lane-level): fetchEpics runs at the FLEET scope with fleet.worktreePath, outside the per-lane try/catch. Lane worktree removal is already recovered at engine.ts:415 (recreate-or-done). Only the milestone worktree could brick the tick, so the quarantine belongs on the fleet.
- TDD: two RED tests first (scanFleet must not throw + must not abandon healthy fleets), then GREEN. 293 passing, lint/typecheck clean.

## Notes

- The broker (broker.ts:33) already wrapped each tick in try/catch, so a throw never killed the daemon process — the real damage was that the throw exited scanFleet entirely, stalling ALL fleets sharing the daemon every 5s, forever. Quarantining the broken fleet lets the rest proceed.
- Recovery is manual (not in scope): 'hordr fleet create <id>' (idempotent, restores worktree) then UPDATE fleets SET status='active', or 'hordr fleet abort <id>'. A follow-up could teach 'hordr fleet reset' to flip a broken fleet back to active + recreate the ms worktree.
