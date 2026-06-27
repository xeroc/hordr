---
# hordr-rt1e
title: 'Simplify: collapse step kinds to agent + hitl'
status: todo
type: epic
priority: critical
created_at: 2026-06-27T12:55:04Z
updated_at: 2026-06-27T12:58:10Z
---

## Requirement

The current engine prescribes a coding-specific workflow via 8 closed-set step kinds (draft-spec, hitl, implement, test, review, commit, pr, cleanup). Hordr's actual value is generic agent orchestration: sequence agents through a workflow with HITL gates and concurrency limits. The coding-specific logic (commit trailers, PR creation, test signal parsing, worktree cleanup) belongs in agent personas, not engine handlers.

## Spec

Collapse the step-kind set from 8 to 2:
- `agent`: spawn a role-configured agent, wait for done-or-blocked, advance or block accordingly.
- `hitl`: block until an external signal (approve, merge, whatever).

Worktree lifecycle moves from step-driven to workflow-driven:
- Workflow config declares `worktree: true/false`.
- Engine creates the worktree when a Run starts on a worktree workflow.
- Engine removes it when the Run terminates (closed via close-merged, or reset).

Agent status IS the signal — no output parsing. Herdr already supports `idle|working|blocked|done|unknown`. The engine waits for `done` (advance) or `blocked` (run blocks). `detectTestSignal`, `readAgentOutput`, and `test-signal.ts` are deleted entirely.

## Decisions

- [ADR-0011](docs/adr/0011-generic-agent-orchestration.md) — Hordr is a generic agent orchestrator, not a coding-workflow engine (accepted)
- [ADR-0012](docs/adr/0012-worktree-is-workflow-config.md) — Worktree lifecycle is workflow-level config, not step-driven (accepted)
- [ADR-0013](docs/adr/0013-agent-status-is-signal.md) — Agent self-reported herdr status replaces output parsing (accepted)

## Decomposition

<!-- filled during decomposition -->

- [ ] hordr-cerd — Delete 6 step handlers + test-signal.ts + EngineDeps methods
- [ ] hordr-92m9 — New generic `agent` step handler: spawn + wait-for-done-or-blocked
- [ ] hordr-g3te — Worktree lifecycle: workflow-level `worktree:` config + engine create/remove on run start/terminate
- [ ] hordr-ymjk — Simplify workflow config schema + update .beans.yml workflows
- [ ] hordr-nlt2 — Update SPEC.md, CONTEXT.md, README.md, ADRs

## Acceptance Criteria

- [ ] Only 2 step kinds exist: `agent` and `hitl`
- [ ] No step handler imports git, gh, or parses agent output
- [ ] `detectTestSignal` and `readAgentOutput` deleted from EngineDeps and runtime.ts
- [ ] Worktree creation/removal is driven by workflow config, not step handlers
- [ ] Workflow YAML uses `- agent: <role>` and `- hitl: <flavor>` syntax
- [ ] All existing tests updated; build + lint clean
- [ ] SPEC.md, CONTEXT.md, README.md reflect the simplified model

## Test Plan

Update existing step handler tests to cover the generic `agent` handler (done → advance, blocked → run blocks). Verify worktree create/remove on run start/terminate. Verify simplified workflow config parses.
