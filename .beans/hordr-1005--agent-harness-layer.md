---
# hordr-1005
title: Agent harness layer
status: todo
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
order: E
---

Resolve harness binaries, inject personas as opening prompts, and detect test signals (test-green / test-red).

## Requirement

Each agent role maps to a harness binary (from config). The persona is injected as the first message sent to the harness pane. Test signals are parsed from tester pane output.

## Spec

Harness resolution looks up the binary on PATH. Persona injection sends the persona text as the opening `pane run` command, then sends the bean's context (id, body summary). Test signal detection matches `test-green` or `test-red` in recent pane output after the tester harness signals done.

## Acceptance Criteria

- [ ] Harness binary is resolved from config + PATH; fails loud if missing
- [ ] Persona text is sent as the first message to the pane
- [ ] Bean context (id, requirement, AC) is included in the opening prompt
- [ ] `test-green` detection advances the Run; `test-red` blocks it

## Test Plan

Unit test harness resolution (found, not found). Integration test: spawn a labeled pane, send persona, verify it arrives. Unit test the signal regex against sample outputs.
