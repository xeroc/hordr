---
# hordr-jd9m
title: Type-aware validate-spec
status: completed
type: task
priority: high
created_at: 2026-06-26T20:59:34Z
updated_at: 2026-06-26T21:05:21Z
parent: hordr-1t2j
---

## Requirement

`hordr validate-spec` currently assumes every bean has the 4-section task body contract. With ADR-0008, epics now use a 6-section contract (Requirement, Spec, Decisions, Decomposition, Acceptance Criteria, Test Plan). The validator must dispatch on bean type.

## Spec

Modify `src/beans/validate-spec.ts` to accept a `type` parameter (or read the bean and extract type). Build a SECTION_REQUIREMENTS map:

```ts
const TASK_SECTIONS = [
  "## Requirement",
  "## Spec",
  "## Acceptance Criteria",
  "## Test Plan",
];
const EPIC_SECTIONS = [
  "## Requirement",
  "## Spec",
  "## Decisions",
  "## Decomposition",
  "## Acceptance Criteria",
  "## Test Plan",
];
```

For epics, `## Decisions` and `## Decomposition` may have empty content (Decisions empty = no ADRs; Decomposition empty = not yet decomposed) but the section header MUST exist. `## Acceptance Criteria` still requires a `- [ ]` checkbox for both types.

Update `src/commands/validate-spec.ts` to call the type-aware validator: read bean via `getBean`, extract `type`, dispatch.

## Decisions

- [ADR-0008](docs/adr/0008-epic-bean-is-spec.md) — epic body contract (accepted)

## Acceptance Criteria

- [ ] `validateSpec(body, 'task')` checks 4 sections (existing behavior preserved)
- [ ] `validateSpec(body, 'epic')` checks 6 sections; Decisions/Decomposition may be empty content but header required
- [ ] `validateSpec(body, 'epic')` requires AC checkbox (same as task)
- [ ] `hordr validate-spec <epic-bean>` exits 0 on valid epic body
- [ ] `hordr validate-spec <task-bean>` exits 0 on valid task body (unchanged)
- [ ] All existing tests still pass; new tests cover epic path

## Test Plan

Table-driven: complete epic body, each epic section missing individually, each epic section empty (esp. Decisions/Decomposition allowed empty), no AC checkbox in epic. Existing task tests unchanged.

## Summary of Changes

- src/beans/validate-spec.ts: validateSpec(body, type='task') now dispatches on bean type. Epics require 6 sections (Requirement/Spec/Decisions/Decomposition/AC/TestPlan); tasks/bugs keep 4 sections. Decisions + Decomposition are header-only-OK for epics (body may be empty).
- src/commands/validate-spec.ts: reads bean.type via getBean and dispatches. --json emits type alongside {valid, missing, empty}.
- test/beans/validate-spec.test.ts: 9 new epic-path tests. Total 21 tests (was 12).
- All 287 project tests passing, lint clean (one warning in unrelated manifest test).

ADR-0008 (epic bean IS the spec) implemented.
