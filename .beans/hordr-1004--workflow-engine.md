---
# hordr-1004
title: Workflow engine (Run state machine, steps, queue)
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:22:08Z
---

The core: Run state machine, idempotent step executor, supervisor loop, concurrency queue, and close-merged scanner.

## Requirement

This is the heart of hordr. A Run moves through workflow steps; each step is idempotent (safe to retry). The queue enforces concurrency limits. `close-merged` detects merged PRs and finalizes.

## Spec

Run state transitions follow the SPEC.md state diagram. Each step kind is a handler function `(run, step, config) → {newState, output}`. `advance` calls the current step's handler, writes state, and returns. `supervise` loops advance until terminal/blocked. Queue is a sorted scan of state files with `status: queued`.

## Acceptance Criteria

- [x] Run state machine enforces valid transitions; rejects invalid ones (hordr-1401)
- [x] Each of the 8 step kinds has a handler (hordr-1402)
- [x] advance is idempotent (hordr-1403)
- [x] Queue rejects new Runs when concurrency is reached (hordr-1404)
- [x] drain starts queued Runs until concurrency limit (hordr-1404)
- [x] close-merged detects merged PRs and closes the Run + worktree (hordr-1405)
- [x] reset deletes state via existing deleteRun + deps.removeWorktree (state layer built in hordr-1103; CLI wiring in hordr-1006)

## Test Plan

Unit test the state machine transitions (valid and invalid). Unit test each step handler with mocked beans/herdr/harness dependencies. Unit test the queue overflow and drain logic.

## Summary of Changes

Epic delivered via 5 child tasks, all using EngineDeps injection (no direct harness imports) to enable parallel work with hordr-1005:
- hordr-1401 (run state machine): transition() + ALLOWED_TRANSITIONS table, TransitionError.
- hordr-1402 (step handlers): 8 handlers (draft-spec/hitl/implement/test/review/commit/pr/cleanup), uniform signature, idempotent.
- hordr-1403 (advance/supervise): idempotent advance, blocking supervise loop, handler injection for testing.
- hordr-1404 (queue/drain): activeCount/capacity/enqueue/drain, FIFO, supervisor spawn injectable.
- hordr-1405 (close-merged): gh pr view scan, status transitions, fail-soft per-run.

Barrel at src/engine/index.ts. STUB_DEPS in src/engine/types.ts throws on every call (wiring in hordr-1006).

All 155 tests passing. Build + lint clean.
