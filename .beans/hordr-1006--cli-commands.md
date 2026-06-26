---
# hordr-1006
title: CLI commands (plan, approve, run, advance, status, drain, reset, close-merged)
status: todo
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
order: F
---

Wire the engine to OCLIF command classes. Every user-facing command is one OCLIF command.

## Requirement

The user interacts with hordr exclusively through CLI commands. Each command must parse args, load config, call the engine, and print clear output.

## Spec

One OCLIF command class per command in the SPEC.md command table. Commands are thin: arg parsing → engine call → output formatting. No business logic in commands.

## Acceptance Criteria

- [ ] Every command from SPEC.md §5 exists and runs
- [ ] `hordr status` prints a table: bean id, run state, current step, pane labels, queue position
- [ ] `hordr plan` spawns the planner and transitions the bean
- [ ] `hordr approve` validates then transitions
- [ ] `hordr run` enqueues + drains + spawns supervisor
- [ ] `hordr close-merged` scans and finalizes

## Test Plan

Smoke test each command against a test project with mock beans/herdr. Verify output format is machine-parseable (JSON via `--json` flag where useful).
