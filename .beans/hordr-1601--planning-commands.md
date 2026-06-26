---
# hordr-1601
title: Planning commands (plan, validate-spec, approve)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1006
order: F1
---

## Requirement

Wire the three planning-phase commands to the engine. These are the HITL gate surface.

## Spec

Create OCLIF command classes in `src/commands/`. `plan <bean>`: create Run (state `planning`), spawn planner pane, wait for done, set bean → `draft`, Run → `awaiting-approval`, notify human. `validate-spec <bean>`: read body, run validator, print result, exit code. `approve <bean>`: run validate-spec, on pass: bean `draft` → `todo`, Run → `queued`, attempt drain.

## Acceptance Criteria

- [ ] `hordr plan <bean>` spawns planner and transitions bean to `draft`
- [ ] `hordr validate-spec <bean>` exits 0 if valid, 1 if not, with missing sections listed
- [ ] `hordr approve <bean>` rejects if validate-spec fails
- [ ] `hordr approve <bean>` on valid spec transitions bean → `todo` and Run → `queued`
- [ ] `--json` flag on validate-spec returns structured output

## Test Plan

Smoke test each command against a test project with mock harness. Verify bean status transitions. Test approve-rejects-on-invalid-spec.
