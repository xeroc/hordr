---
# hordr-1503
title: Test signal detection (test-green / test-red)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1005
order: E3
---

## Requirement

After the tester harness signals done, parse its output for `test-green` or `test-red` and drive the Run state accordingly.

## Spec

Create `src/harness/test-signal.ts`. `detectTestSignal(paneId)` → reads recent pane output, searches for `test-green` or `test-red` (literal match, case-sensitive). Returns `"green" | "red" | null`. The test step handler calls this after `waitAgentDone`; `green` advances, `red` blocks the Run.

## Acceptance Criteria

- [ ] Output containing `test-green` → returns `"green"`
- [ ] Output containing `test-red` → returns `"red"`
- [ ] Neither present → returns `null`
- [ ] Both present (shouldn't happen) → returns `"red"` (fail-safe)

## Test Plan

Table-driven: sample outputs with green, red, neither, both. Verify fail-safe on ambiguity.
