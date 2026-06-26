---
# hordr-1t2j
title: 'Refactor: planning & discovery model (SPEC-delta-planning)'
status: todo
type: epic
priority: high
created_at: 2026-06-26T20:48:54Z
updated_at: 2026-06-26T20:59:44Z
---

## Requirement

The current hordr treats every bean as a task with a 4-section body. The planning model needs to mature: epics hold full specs (the bean IS the spec), a stateless `hordr decompose` command creates children on develop (no worktree), and decomposed children skip the planning phase entirely — entering the Run state machine at `queued`.

## Spec

See SPEC-delta-planning.md for the full design. Key changes:

1. **Epic body contract (6 sections):** Requirement, Spec, Decisions, Decomposition, Acceptance Criteria, Test Plan. Tasks/bugs keep the 4-section contract.
2. **Type-aware validate-spec:** dispatch on bean type (epic vs task/bug).
3. **New `hordr decompose <epic>` command:** stateless, runs on develop (no worktree), spawns planner pane, creates child task beans, fills epic's Decomposition section, marks epic completed.
4. **Decomposed children enter at queued:** `hordr run <child>` creates Run directly at `queued` if the child has a completed epic parent — skips `planning` and `awaiting-approval`.
5. **Planner agent persona** added to config (used by decompose).

## Decisions

- [ADR-0008](docs/adr/0008-epic-bean-is-spec.md) — Epic bean body IS the spec; no separate specs/ directory (accepted)
- [ADR-0009](docs/adr/0009-decompose-is-stateless.md) — `hordr decompose` is a stateless command, not a Run; epics never have Run state (accepted)
- [ADR-0010](docs/adr/0010-children-skip-planning.md) — Decomposed task beans enter Run state machine at `queued`, skipping planning (accepted)

## Decomposition

<!-- filled by hordr decompose; empty until decomposition runs -->

- [x] hordr-itiu — Cleanup: commit signing retry + queue spawn resilience
- [ ] hordr-jd9m — Type-aware validate-spec (epic 6 sections, task/bug 4 sections)
- [ ] hordr-cqjx — hordr decompose <epic> command
- [ ] hordr-gn70 — hordr run <child> skips planning for tasks with completed epic parent
- [ ] hordr-si47 — Update SPEC.md (merge delta) + archive SPEC-delta-planning.md

## Acceptance Criteria

- [ ] `hordr validate-spec <epic>` checks 6 sections; `hordr validate-spec <task>` checks 4
- [ ] `hordr decompose <epic>` spawns planner on develop, creates children, fills Decomposition section
- [ ] Decomposed children can be `hordr run` without prior `plan`/`approve`
- [ ] Epic body contract enforced for new epic beans
- [ ] All existing tests still pass (or are updated sensibly)
- [ ] SPEC.md updated to reflect the new model; delta file archived

## Test Plan

Unit tests per new command + modified validate-spec. Integration test: create epic, decompose, run child, verify Run state. Update existing validate-spec tests to cover both type paths.
