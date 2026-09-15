---
# hordr-dme7
title: 'hordr prompt command: ad-hoc named workspace + bare default-harness pane'
status: completed
type: feature
priority: normal
created_at: 2026-09-15T13:44:25Z
updated_at: 2026-09-15T13:49:38Z
---

Add a new CLI command: hordr prompt [name] [--base ref] [--json].

Requirement:
- Create an isolated working copy named `name` via the VCS adapter (git worktree with branch=name / jj workspace named name) — reuse HordrDeps.createWorktree + getVcsOrMock, no beans involved.
- Open a new pane (tab) in that workspace, labeled hordr:<name>.
- In the pane, start the default harness BARE: just the default_harness binary, no prompt, no persona, no --interactive/--mini/-i flags — the human drives the session.

Acceptance Criteria:
- [x] hordr prompt <name> creates workspace + pane + bare harness command
- [x] --base forwards to createWorktree (default config.primary_branch)
- [x] --json emits {name, branch, pane, workspace}
- [x] missing name arg exits 2
- [x] assertVcsReady gate at entry (jj readiness), same as hordr run
- [x] unit tests for launcher.launchHarness (bare command, label, PATH check)
- [x] lint + full test suite pass

## Summary of Changes

- `src/commands/prompt.ts`: new `hordr prompt <name> [--base <ref>] [--json]` — assertVcsReady gate, `createWorktree(name, base)`, `launchHarness` in the new workspace, human-readable/JSON output.
- `src/harness/launcher.ts`: `launchHarness({cwd, name, workspaceId})` — creates a tab labeled `hordr:<name>` and runs `default_harness` BARE (` opencode`), PATH-checked. No prompt, no persona, no --interactive/--mini.
- `src/runtime.ts`: `HordrDeps.launchHarness` added (+ createDeps wiring); `createWorktree` param renamed `beanId` → `name` (positional, no callsite change).
- Tests: `test/commands/prompt.test.ts` (4 cases), `launchHarness` describe in `test/harness/launcher.test.ts` (bare-command contract + PATH failure), `run.test.ts` stub extended.
- README: command table + `hordr prompt` section.

Verified: full mocha suite 437 passing; lint clean (pre-existing warnings only); live smoke `hordr prompt spike-smoke --json` → worktree from develop + pane wPH:p2 + bare harness, artifacts removed afterwards.
