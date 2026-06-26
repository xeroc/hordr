---
# hordr-1005
title: Agent harness layer
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:22:18Z
---

Resolve harness binaries, inject personas as opening prompts, and detect test signals (test-green / test-red).

## Requirement

Each agent role maps to a harness binary (from config). The persona is injected as the first message sent to the harness pane. Test signals are parsed from tester pane output.

## Spec

Harness resolution looks up the binary on PATH. Persona injection sends the persona text as the opening `pane run` command, then sends the bean's context (id, body summary). Test signal detection matches `test-green` or `test-red` in recent pane output after the tester harness signals done.

## Acceptance Criteria

- [x] Harness binary resolved from config + PATH; fails loud if missing (hordr-1501)
- [x] Persona text sent as opening prompt (after harness binary); (hordr-1501)
- [x] Bean context (id, title, requirement, AC) included in opening prompt (hordr-1501)
- [x] test-green advances; test-red (or ambiguous) blocks; (signal detection hordr-1503, advance/block hordr-1402 test handler)

## Test Plan

Unit test harness resolution (found, not found). Integration test: spawn a labeled pane, send persona, verify it arrives. Unit test the signal regex against sample outputs.

## Summary of Changes

Epic delivered via 3 child tasks:
- hordr-1501 (launcher): resolveHarness/buildOpeningPrompt/launchAgent. Persona + bean context in opening prompt. Pane labeled hordr:<beanId>:<role>.
- hordr-1502 (pane lifecycle): waitForAgentDone (blocking), readAgentOutput, splitSiblingPane. All sync via herdr shell-out seam.
- hordr-1503 (test-signal): detectTestSignal, red-first ordering for fail-safe.

Barrel at src/harness/index.ts. Methods match EngineDeps contract (src/engine/types.ts) for hordr-1006 wiring.

**Known limitation (deferred to hordr-1003):** Real herdr CLI addresses panes by pane_id, not label. pane list/get do not surface labels. Label-based addressing implemented as documented best-guess; real label<->pane_id resolution + actual herdr subcommand shape verification belongs to hordr-1003 (herdr client layer).

All 155 tests passing. Build + lint clean.
