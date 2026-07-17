---
# hordr-qbj1
title: Support omp harness in launcher
status: completed
type: task
priority: normal
created_at: 2026-07-15T13:37:20Z
updated_at: 2026-07-15T13:47:24Z
---

Extend buildHarnessCommand to handle omp: bare invocation with @AGENTS.md include (opencode uses run --interactive, omp does not auto-load AGENTS.md). Wire into both launchAgent (launcher.ts) and spawnInvocation (spawn.ts).

## Summary of Changes

- Added `buildHarnessCommand(harness, prompt)` to `src/harness/launcher.ts` — routes omp to `omp @AGENTS.md '<prompt>'` (bare invocation + explicit AGENTS.md include), all others to `<harness> run --interactive '<prompt>'`.
- Wired into both call sites: `launchAgent` (launcher.ts) and `spawnInvocation` (spawn.ts).
- TDD: 3 unit tests for buildHarnessCommand (opencode / omp / unknown), 1 integration test for omp in spawnInvocation. All 18 pass.
