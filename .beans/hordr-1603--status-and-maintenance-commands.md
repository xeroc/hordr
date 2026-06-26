---
# hordr-1603
title: Status and maintenance commands (status, drain, close-merged)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T16:15:49Z
parent: hordr-1006
---

## Requirement

Observability and maintenance: see the horde state, drain the queue, and close merged PRs.

## Spec

`status`: list all Runs with columns: bean id, workflow, state, current step, worktree workspace, pane labels, queue position. `--json` for machine consumption. `drain`: start queued Runs until concurrency limit. Prints how many started. `close-merged`: scan `pr-open` Runs, detect merged PRs via `gh`, finalize.

## Acceptance Criteria

- [ ] `hordr status` prints a table of all Runs (or "no active runs")
- [ ] `hordr status --json` returns parseable JSON
- [ ] `hordr drain` starts queued Runs and prints the count
- [ ] `hordr close-merged` finalizes merged Runs and prints the count

## Test Plan

Populate multiple Run states, run status, verify output. Enqueue beyond limit, drain, verify count. Mock gh for close-merged.

## Summary of Changes

- src/commands/{status,drain,close-merged}.ts: replaced stubs.
- status: hand-rolled table (no table library) with cols bean/workflow/status/step/worktree/panes + queue summary line. 'no active runs' when empty. --json emits {runs[], queue:{active,capacity,queued}}.
- drain: wraps engine/drain, prints count + ids or 'queue empty'.
- close-merged: wraps engine/closeMerged, prints closed/skipped/failed counts.
- drain command owns a thin spawnSupervisor helper that honours HERDR_BIN_PATH (workaround for engine/queue.ts defaultSpawnSupervisor being non-injectable without touching queue.ts).
- 13 tests covering empty state, multi-run output, capacity enforcement, gh mocking.
