---
# hordr-gn70
title: run skips planning
status: completed
type: task
priority: high
created_at: 2026-06-26T20:59:34Z
updated_at: 2026-06-27T11:35:51Z
parent: hordr-1t2j
---

## Requirement

Per ADR-0010, decomposed task beans (children of a completed epic) skip the planning phase. `hordr run <child>` should create the Run directly in `queued` state, not require prior `hordr plan` + `hordr approve`.

## Spec

Modify `src/commands/run.ts`:

- If bean has a parent of type `epic` with status `completed`:
  - Skip the "bean must be todo + run must be queued" pre-check (those are planning-flow states).
  - If no Run exists, create one directly in `queued` state via `putRun`.
  - Set workflow assignment via `setWorkflow` (default routing.default_workflow).
  - Call `enqueue` as before.
- Otherwise (standalone task): unchanged. Require Run exists in `queued` state from prior plan/approve.

Detection: read bean via `getBean` (returns parent ID); query parent via `getBean(parentId)` to check type+status. Ponytail: two bean reads, no cache.

Body validation: before creating the Run, run `validateSpec(body, bean.type)`. Refuse to start if invalid (protects against half-decomposed children).

## Decisions

- [ADR-0010](docs/adr/0010-children-skip-planning.md) — children enter at queued (accepted)

## Acceptance Criteria

- [ ] `hordr run <task-with-completed-epic-parent>` creates Run directly at queued, no prior plan needed
- [ ] `hordr run <standalone-task>` unchanged (requires Run in queued from prior plan)
- [ ] Refuses if child body fails validateSpec
- [ ] Refuses if epic parent not completed (decompose didn't finish)
- [ ] --json flag emits structured output

## Test Plan

Mock beans + state. Test: child-of-completed-epic happy path (Run created at queued, enqueued). Test: standalone task refusal (no Run). Test: invalid child body refusal. Test: epic-not-completed refusal.

## Summary of Changes

- src/commands/run.ts: two-path entry per ADR-0010.
  - **Decomposed child path** (bean has parent_id pointing to a completed epic, no existing Run): validates body via type-aware validateSpec, creates Run directly at 'queued' status with workflow from routing.default_workflow, calls setWorkflow, then enqueues. No prior plan/approve needed.
  - **Standalone task path** (no epic parent or parent not completed): unchanged. Requires prior hordr plan (Run exists in 'queued').
- Body validation gate: both paths validate the bean body before starting. Protects against half-decomposed children or partially-drafted standalone tasks.
- test/commands/run.test.ts: 3 new tests (child-of-completed-epic happy path, child-of-incomplete-epic falls through, invalid body refusal). Existing 5 tests updated with valid 4-section body fixtures (body validation now runs before status checks).
- 298 tests passing, lint clean.
