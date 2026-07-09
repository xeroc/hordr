---
# hordr-w843
title: hordr fleet abort <milestone-id> [--force]
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T08:14:41Z
parent: hordr-t3wf
---

Stop the per-fleet loop, keep worktree by default (work preserved for manual inspection). --force also removes the worktree (unmerged work discarded). Keep beans for retry. Delete fleet row.



## Per-epic model update (grilling session)

fleet abort now: stop ALL lane dispatch loops, keep worktrees by default (work preserved), --force removes all epic worktrees + the milestone branch. Delete all lane rows + fleet row.

## Summary of Changes

- `src/fleet/lifecycle.ts`: `abortFleet` — deletes lane + fleet rows (stops daemon tick); --force removes lane worktrees + force-deletes ms/<id> branch; refuses if no fleet
- `src/commands/fleet/abort.ts`: `hordr fleet abort <milestone-id> [--force] [--json]`; tolerant worktree removal (open by branch → remove, no-op if gone)
- Tests: abortFleet lifecycle (keep vs force vs no-fleet), command end-to-end (--force tolerates already-gone worktree)

Daemon loops halt because the fleet row is gone (tick guard). Beans always kept for retry.
