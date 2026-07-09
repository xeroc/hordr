---
# hordr-1xjt
title: Pane reuse per fleet (one stable pane, sequential invocations)
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T08:19:08Z
parent: hordr-hj0i
---

On first dispatch for a fleet, create a pane in the worktree's tab. Reuse it for every subsequent invocation (herdr pane run into the existing pane after the prior opencode exits). Between tasks the pane is briefly at a shell prompt. Verify shell-state leakage doesn't corrupt the next opencode session.

## Summary of Changes

- `src/dispatch/pane.ts`: `ensureLanePane` — pure function: creates a pane on first dispatch, reuses the stored paneId after; takes injectable createPane dep
- `src/storage/fleets.ts`: `setLanePane` — persists the lane's stable pane id
- Tests: ensureLanePane (create vs reuse vs empty-string), setLanePane round-trip

Shell-state leakage is bounded: each invocation is a fresh harness process run into the reused pane; documented in pane.ts. The daemon loop wires ensureLanePane + setLanePane on each dispatch tick.
