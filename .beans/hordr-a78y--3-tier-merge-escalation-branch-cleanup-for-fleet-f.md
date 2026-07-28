---
# hordr-a78y
title: 3-tier merge escalation + branch cleanup for fleet finish
status: completed
type: task
priority: high
created_at: 2026-07-27T18:45:12Z
updated_at: 2026-07-27T19:09:52Z
---

Apply the same 3-tier merge strategy (ff-only -> no-ff -> agent-assisted) to hordr fleet finish's ms->primary merge. On any successful merge (both lanes and fleet), remove the source worktree THEN delete the source branch. Only on success.

## Summary of Changes

### 3-tier merge escalation for fleet finish (ms→primary)
- `finishFleet` now uses `attemptMerge` (ff-only → no-ff → spawn merger agent) instead of the single-tier `mergeMilestoneToPrimary` (--no-ff, throw on conflict).
- On tier 3 conflict: spawns a merger agent in the ms worktree, sets fleet → 'merging', stores pane ID. Returns `{merged: false, conflictPaneId}`.
- The engine's `scanFleet` tick loop detects 'merging' fleets, checks merger agent completion (pane dead + `isMergeComplete`), and finishes teardown on resolution or sets → 'conflict' if unresolved.

### Branch + worktree cleanup on successful merge
- `finishFleetTeardown` (new shared function): commits beans → removes worktree → deletes ms branch (`-d` safe delete) → deletes rows.
- Called on both immediate tier 1/2 success AND after merger resolution in the tick loop.
- Lane teardown (`finishLaneTeardown`) already did worktree + branch removal — unchanged.

### Storage
- Added `pane_id` column to `fleets` table (schema + migration for old DBs).
- Added `setFleetPane` helper. `FleetRow.paneId` is optional (only set during 'merging').

### Guard
- `finishFleet` refuses if fleet is already 'merging' (re-entrant protection).

### Files changed
- `src/storage/db.ts` — schema + migration for fleets.pane_id
- `src/storage/fleets.ts` — FleetRow.paneId, setFleetPane
- `src/fleet/lifecycle.ts` — finishFleet refactor (3-tier), finishFleetTeardown, merging guard
- `src/dispatch/engine.ts` — scanFleet fleet 'merging' detection
- `src/commands/fleet/finish.ts` — wire spawnMerger + getConflictedFiles deps
- Tests: lifecycle, engine, command, storage
