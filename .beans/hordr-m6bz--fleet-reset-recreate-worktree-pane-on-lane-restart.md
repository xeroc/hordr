---
# hordr-m6bz
title: 'Fleet reset: recreate worktree + pane on lane restart'
status: completed
type: task
priority: normal
created_at: 2026-07-15T14:30:24Z
updated_at: 2026-07-15T14:41:45Z
---

Extend fleet reset to check worktree existence (recreate if gone), check pane existence (recreate if dead), atomically update lane via setLaneWorktree, and set status active. Handle both conflict and uncommitted lanes.

## Summary of Changes

- Added `resetLane(db, lane, fleet, deps)` to `fleet/lifecycle.ts` — checks worktree exists (recreate via create/open if gone), checks pane exists (create if dead/null), atomically updates lane via `setLaneWorktree` (clears task), sets status to 'active'.
- Added `ResetLaneDeps` + `ResetLaneResult` interfaces.
- Added `getLane(db, epicId)` to `storage/fleets.ts` for single-lane lookup.
- Rewrote `reset.ts` command to call `resetLane` with real herdr wiring. Added `--force` for uncommitted lanes. Reports what was recreated.
- TDD: 5 unit tests for resetLane (reuse, recreate worktree, openWorktree fallback, dead pane, null pane).
