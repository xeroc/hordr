---
# hordr-q0th
title: hordr fleet status <milestone-id>
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T07:42:26Z
parent: hordr-t3wf
---

Show: fleet state, current task + role + pane, ready-queue depth, completed count, drafts-awaiting-review (ADR-0013), stuck/blocked tasks. The human's main observation surface. JSON mode for machine consumption.



## Per-epic model update (grilling session)

fleet status now shows: fleet state + ALL lanes (each lane = an epic with its own worktree/pane/status). Lane statuses: pending (blocked), active (dispatching), merging, conflict (merge conflict — human needed), done. Shows drafts-awaiting-review per lane.

## Summary of Changes

- `src/fleet/lifecycle.ts`: `describeFleet` — reads fleet + lanes (throws FleetError if no fleet row)
- `src/commands/fleet/status.ts`: `hordr fleet status <milestone-id>` [--json]
- Human output: fleet state + per-lane (epic, status, current task, pane)
- JSON output: milestone, status, branch, lanes[] (epic, status, currentTask, pane, branch, worktree)
- Reports "no lanes yet" before the daemon creates any

Drafts-awaiting-review section is a separate task (hordr-jzja).
