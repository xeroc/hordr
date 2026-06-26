---
# hordr-1006
title: CLI commands (plan, approve, run, advance, status, drain, reset, close-merged)
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T16:16:22Z
---

Wire the engine to OCLIF command classes. Every user-facing command is one OCLIF command.

## Requirement

The user interacts with hordr exclusively through CLI commands. Each command must parse args, load config, call the engine, and print clear output.

## Spec

One OCLIF command class per command in the SPEC.md command table. Commands are thin: arg parsing → engine call → output formatting. No business logic in commands.

## Acceptance Criteria

- [x] Every command from SPEC.md §5 exists and runs (11 user-facing commands wired: plan/validate-spec/approve/run/advance/supervise/take/status/drain/reset/close-merged; 2 event hooks on-worktree-{created,removed} remain no-op stubs pending hordr-1007)
- [x] hordr status prints table: bean/workflow/status/step/worktree/panes + queue summary (hordr-1603)
- [x] hordr plan creates worktree + drives draft-spec via engine advance; bean → draft, run → awaiting-approval (hordr-1601)
- [x] hordr approve validates spec, transitions bean → todo + run → queued, calls enqueue (hordr-1601)
- [x] hordr run enqueues (spawns supervisor pane if slot available) (hordr-1602)
- [x] hordr close-merged scans pr-open runs, finalizes merged (hordr-1603)

## Test Plan

Smoke test each command against a test project with mock beans/herdr. Verify output format is machine-parseable (JSON via `--json` flag where useful).

## Summary of Changes

The integration capstone. Wired 11 of 13 stub commands to real engine logic (the other 2 are event hooks for hordr-1007).

**Foundation work (done before dispatching command subagents):**
- Refactored src/harness/launcher.ts to use real herdr primitives (src/herdr/pane.ts + src/herdr/wait.ts) instead of best-guess _herdr calls. Old _herdr seam removed; new seams are _setListPanesForTesting + _setWhichForTesting.
- Updated src/harness/test-signal.ts to call src/herdr/pane.ts readPane directly (was going through launcher's readAgentOutput).
- Rewrote test/harness/launcher.test.ts + test/harness/test-signal.test.ts to mock at the herdr primitive level.
- Added listPanes(workspaceId) helper to src/herdr/pane.ts.
- Added optional 'path' field to Run state worktree object (backwards-compatible schema extension).
- Created src/runtime.ts: createEngineDeps() + getDeps() + _setDepsForTesting() — composes EngineDeps from real implementations across src/herdr/*, src/harness/*, src/beans/*.

**Commands (3 parallel child tasks):**
- hordr-1601 (planning): plan/validate-spec/approve. 13 tests.
- hordr-1602 (execution): run/advance/supervise/take/reset. 25 tests.
- hordr-1603 (status/maintenance): status/drain/close-merged. 13 tests.

Total: 256 tests passing (was 205). Build + lint clean. CLI verified end-to-end:
  ./bin/dev.js status → 'no active runs'
  ./bin/dev.js validate-spec hordr-1006 → 'spec is valid'
  ./bin/dev.js drain → 'queue empty'

**Follow-ups flagged by subagents (non-blocking):**
- src/engine/queue.ts defaultSpawnSupervisor spawns 'hordr' directly (no HERDR_BIN_PATH awareness, no error handler). drain.ts works around this with a thin spawnSupervisor helper; hordr-1007 could clean this up.
- take.ts pane selection uses last-inserted heuristic (v1 shortcut; multi-pane-blocked runs need manual tab cycling).
- run.ts interpretation: 'run' consumes an already-queued run (worktree created by 'plan' per §3). If a from-scratch 'run <bean>' workflow is wanted, that's a separate bean.

**Remaining:** hordr-1007 (Herdr plugin manifest polish + event hooks for on-worktree-{created,removed}). The commands exist as no-op stubs; hordr-1007 makes them real (or documents them as intentionally no-op).
