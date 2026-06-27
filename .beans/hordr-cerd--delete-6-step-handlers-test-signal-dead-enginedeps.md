---
# hordr-cerd
title: Delete 6 step handlers + test-signal + dead EngineDeps methods
status: completed
type: task
priority: critical
created_at: 2026-06-27T12:56:39Z
updated_at: 2026-06-27T13:17:57Z
parent: hordr-rt1e
---

## Requirement

Remove all coding-specific step handlers and their dependencies. Only `agent` (new, created in separate task) and `hitl` survive.

## Spec

Delete:
- src/engine/steps/draft-spec.ts
- src/engine/steps/implement.ts
- src/engine/steps/test.ts
- src/engine/steps/review.ts
- src/engine/steps/commit.ts
- src/engine/steps/pr.ts
- src/engine/steps/cleanup.ts
- src/harness/test-signal.ts + test/harness/test-signal.test.ts
- EngineDeps.detectTestSignal and EngineDeps.readAgentOutput from src/engine/types.ts
- Corresponding implementations in src/runtime.ts
- All corresponding test files

Update src/engine/steps/index.ts to export only `hitl` (the `agent` handler arrives in the next task).
Update STEP_HANDLERS map accordingly.
Update src/engine/types.ts STUB_DEPS to remove deleted methods.

## Acceptance Criteria

- [ ] 6 step handler files + test-signal.ts deleted
- [ ] EngineDeps loses detectTestSignal + readAgentOutput
- [ ] runtime.ts loses corresponding implementations
- [ ] STEP_HANDLERS map has only `hitl` (agent added in next task)
- [ ] Build + lint clean (existing tests updated to not reference deleted handlers)

## Test Plan

Existing step handler tests for deleted handlers are removed. Remaining tests (hitl) still pass.

## Summary of Changes

Implemented as part of the collapse to 2 step kinds (ADR-0011).
