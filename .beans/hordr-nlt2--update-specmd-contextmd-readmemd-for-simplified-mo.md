---
# hordr-nlt2
title: Update SPEC.md, CONTEXT.md, README.md for simplified model
status: todo
type: task
priority: high
created_at: 2026-06-27T12:57:50Z
updated_at: 2026-06-27T12:57:50Z
parent: hordr-rt1e
---

## Requirement

All documentation must reflect the simplified 2-kind model. ADRs 0011-0013 are already written; SPEC/CONTEXT/README need to absorb them.

## Spec

SPEC.md (→ Draft v3):
- §4 Step kinds: replace the 8-kind table with 2-kind table (agent + hitl). Explain: agent spawns + waits for done-or-blocked; hitl blocks for external signal.
- §6 Config schema: update workflow step syntax to `- agent: <role>` / `- hitl: <flavor>`. Add `worktree: boolean` to WorkflowDef.
- §5 CLI commands: note that decompose/plan/run are unchanged; step handlers are internal.
- §3 Run state machine: worktree creation moves from step to run-start; worktree removal on close-merged/reset.
- §9 Non-goals: remove "closed set of 8 kinds" — now 2 kinds, no longer needs to be "closed".

CONTEXT.md:
- Step: update definition. "A phase within a workflow. Has a kind of agent or hitl."
- Agent (role): unchanged but note that ALL domain behavior lives in persona.
- Harness: unchanged.
- Pane: unchanged.
- Worktree: note lifecycle is workflow-driven, not step-driven.

README.md:
- Update the overview to reflect "generic agent orchestrator" positioning.
- Update the workflow YAML example.
- Mention ADRs 0011-0013.

## Acceptance Criteria

- [ ] SPEC.md §4 shows 2 kinds only
- [ ] SPEC.md §6 shows simplified workflow YAML
- [ ] CONTEXT.md Step/Worktree entries updated
- [ ] README.md reflects generic orchestration
- [ ] Version bumped to Draft v3

## Test Plan

Manual review: read updated docs end-to-end, verify consistency.
