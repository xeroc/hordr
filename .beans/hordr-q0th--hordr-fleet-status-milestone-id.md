---
# hordr-q0th
title: hordr fleet status <milestone-id>
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-08T08:44:01Z
parent: hordr-t3wf
---

Show: fleet state, current task + role + pane, ready-queue depth, completed count, drafts-awaiting-review (ADR-0013), stuck/blocked tasks. The human's main observation surface. JSON mode for machine consumption.



## Per-epic model update (grilling session)

fleet status now shows: fleet state + ALL lanes (each lane = an epic with its own worktree/pane/status). Lane statuses: pending (blocked), active (dispatching), merging, conflict (merge conflict — human needed), done. Shows drafts-awaiting-review per lane.
