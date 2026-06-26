---
# hordr-cqjx
title: decompose command
status: todo
type: task
priority: high
created_at: 2026-06-26T20:59:34Z
updated_at: 2026-06-26T20:59:34Z
parent: hordr-1t2j
---

## Requirement

`hordr decompose <epic>` is the stateless command that turns an epic bean into N child task beans (ADR-0009). It spawns a planner pane on develop (no worktree), waits for done, then exits. The planner reads the epic body + ADRs, creates children via `beans create --parent`, fills the epic's Decomposition section.

## Spec

Create `src/commands/decompose.ts`. Preconditions:

- Bean type is `epic`, status is `todo`.
- Body passes `validate-spec` for epic contract.
- Decomposition section is empty (refuse re-decompose with a warning unless `--force`).

Execution:

1. Spawn planner pane on develop. Label: `hordr:<epic-id>:planner`. cwd: current repo root (NOT a worktree).
2. Inject planner persona (from `config.agents.planner`).
3. Wait for done via `waitForAgentDone`.
4. After done: verify children exist via `beans list --parent <epic>`.
5. Set epic status → `completed` via `setStatus`.

Idempotency: refuse if Decomposition non-empty (the planner already ran). `--force` overrides (re-run planner; planner itself should check existing children).

## Decisions

- [ADR-0009](docs/adr/0009-decompose-is-stateless.md) — no Run, no state file, no supervisor pane (accepted)

## Acceptance Criteria

- [ ] `hordr decompose <epic>` refuses if bean type != epic
- [ ] `hordr decompose <epic>` refuses if Decomposition section non-empty (unless --force)
- [ ] `hordr decompose <epic>` spawns planner pane with label `hordr:<epic>:planner`
- [ ] After successful decompose: epic status = completed, ≥1 child bean exists with parent=epic
- [ ] --json flag emits structured output
- [ ] Decompose runs on develop (no worktree created)

## Test Plan

Mock deps + beans shell. Test precondition refusals (wrong type, already-decomposed). Test happy path with mock planner that creates 2 children. Verify epic transitioned to completed. Verify no worktree created (deps.createWorktree not called).
