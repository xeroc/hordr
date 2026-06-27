---
# hordr-g3te
title: 'Worktree lifecycle: workflow-level config + engine create/remove'
status: completed
type: task
priority: high
created_at: 2026-06-27T12:57:20Z
updated_at: 2026-06-27T13:17:57Z
parent: hordr-rt1e
---

## Requirement

Worktree creation/removal moves from step-driven to workflow-driven (ADR-0012). The workflow config declares `worktree: true/false`. The engine creates the worktree when a Run starts, removes it when the Run terminates.

## Spec

1. Config schema (src/config/schema.ts): add `worktree: z.boolean().default(false)` to WorkflowDef.

2. Run command (src/commands/run.ts): after creating the Run state (both standalone and decomposed-child paths), if the workflow has `worktree: true`, call deps.createWorktree(beanId) and store the result in run.worktree BEFORE the first step runs.

3. close-merged (src/engine/close-merged.ts): already calls deps.removeWorktree. No change needed — worktree removal is already here.

4. reset (src/commands/reset.ts): already calls deps.removeWorktree. No change needed.

5. Step handlers: the agent handler (created in previous task) uses run.worktree?.path as cwd for launchAgent. If no worktree, cwd is process.cwd() (develop).

6. launchOrReuse in shared.ts: currently uses run.worktree?.workspace_id as cwd. Change to use run.worktree?.path (the filesystem path) falling back to process.cwd().

## Acceptance Criteria

- [ ] WorkflowDef has optional `worktree: boolean` field
- [ ] hordr run creates worktree if workflow has worktree: true
- [ ] Worktree path stored in run.worktree.path
- [ ] Agent step handler uses run.worktree.path as cwd (falls back to cwd)
- [ ] close-merged and reset still remove worktrees correctly

## Test Plan

Test: workflow with worktree: true → run creates worktree, step handler gets worktree cwd. Workflow with worktree: false → no worktree created, cwd is process.cwd().

## Summary of Changes

Implemented as part of the collapse to 2 step kinds (ADR-0011).
