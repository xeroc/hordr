---
# hordr-1601
title: Planning commands (plan, validate-spec, approve)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T16:15:49Z
parent: hordr-1006
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

## Summary of Changes

- src/commands/{plan,validate-spec,approve}.ts: replaced stubs with real wiring.
- plan: creates Run in 'planning', sets workflow via setWorkflow (body marker), creates worktree via deps, calls advance() to drive draft-spec step. Bean → draft, Run → awaiting-approval.
- validate-spec: pure body validator wrapper. process.exitCode=1 on invalid (NOT this.error which is exit 2). --json emits {valid, missing, empty}.
- approve: validates spec, transitions bean draft→todo, transitions Run awaiting-approval→queued, calls enqueue.
- 13 tests covering happy paths, rejection paths, --json output.
