---
# hordr-ymjk
title: Simplify workflow config schema + update .beans.yml
status: todo
type: task
priority: high
created_at: 2026-06-27T12:57:34Z
updated_at: 2026-06-27T12:57:34Z
parent: hordr-rt1e
---

## Requirement

The workflow config currently uses `kind: implement` / `kind: hitl` / etc with fields like `agent`, `pane`, `wait`, `optional`, `flavor`. Collapse to `agent: <role>` and `hitl: <flavor>`.

## Spec

1. Config schema (src/config/schema.ts): replace StepDefSchema with:
   ```ts
   const AgentStep = z.object({ agent: z.string() })
   const HitlStep = z.object({ hitl: z.enum(['approve', 'external']) })
   const StepDef = z.union([AgentStep, HitlStep])
   ```
   Delete: kind, pane, wait, optional, flavor fields.

2. .beans.yml: rewrite workflows:
   ```yaml
   workflows:
     implement:
       worktree: true
       steps:
         - agent: implementer
         - agent: tester
         - agent: reviewer
         - hitl: external
     plan:
       steps:
         - agent: planner
         - hitl: approve
   ```

3. Step handler dispatch (src/engine/steps/index.ts): STEP_HANDLERS keyed by step shape, not by `kind`. If step has `.agent` → agent handler. If step has `.hitl` → hitl handler.

4. advance.ts: step lookup changes from `STEP_HANDLERS[step.kind]` to dispatching on step shape.

## Acceptance Criteria

- [ ] StepDef is a union of {agent: string} | {hitl: 'approve'|'external'}
- [ ] .beans.yml workflows use the simplified syntax
- [ ] STEP_HANDLERS dispatches on step shape, not kind
- [ ] Config validation rejects unknown step shapes

## Test Plan

Config schema tests updated. Valid/invalid workflow configs tested.
