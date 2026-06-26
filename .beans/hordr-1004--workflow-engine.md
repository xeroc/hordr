---
# hordr-1004
title: Workflow engine (Run state machine, steps, queue)
status: todo
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
order: D
---

The core: Run state machine, idempotent step executor, supervisor loop, concurrency queue, and close-merged scanner.

## Requirement

This is the heart of hordr. A Run moves through workflow steps; each step is idempotent (safe to retry). The queue enforces concurrency limits. `close-merged` detects merged PRs and finalizes.

## Spec

Run state transitions follow the SPEC.md state diagram. Each step kind is a handler function `(run, step, config) → {newState, output}`. `advance` calls the current step's handler, writes state, and returns. `supervise` loops advance until terminal/blocked. Queue is a sorted scan of state files with `status: queued`.

## Acceptance Criteria

- [ ] Run state machine enforces valid transitions; rejects invalid ones
- [ ] Each of the 8 step kinds has a handler
- [ ] `advance` is idempotent (calling twice for the same step is safe)
- [ ] Queue rejects new Runs when `concurrency` is reached
- [ ] `drain` starts queued Runs until concurrency limit
- [ ] `close-merged` detects merged PRs and closes the Run + worktree
- [ ] `reset` deletes state + worktree + branch cleanly

## Test Plan

Unit test the state machine transitions (valid and invalid). Unit test each step handler with mocked beans/herdr/harness dependencies. Unit test the queue overflow and drain logic.
