---
# hordr-1402
title: Step kind handlers (8 closed-set kinds)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1004
order: D2
---

## Requirement

Implement one handler per step kind: draft-spec, hitl (approve), hitl (external), implement, test, review, commit, pr, cleanup.

## Spec

Create `src/engine/steps/` with one file per kind. Each handler: `(run, step, deps) → StepResult` where `StepResult = {done: boolean, runPatch?: Partial<Run>, block?: boolean}`. Handlers are idempotent: check existing state before acting. `draft-spec` spawns planner. `hitl` just blocks. `implement` spawns implementer. `test` splits sibling + waits signal. `review` optional. `commit` checks existing trailer. `pr` checks existing PR. `cleanup` flips status + removes worktree.

## Acceptance Criteria

- [ ] Each handler returns `{done: true}` when its step is complete
- [ ] Each handler returns `{done: false, block: true}` when waiting
- [ ] Calling a handler twice for an already-complete step is a no-op
- [ ] `test` handler with `test-red` output blocks the Run

## Test Plan

Unit test each handler with mocked deps (beans, herdr, harness). Test idempotency: call twice, verify second call is a no-op.
