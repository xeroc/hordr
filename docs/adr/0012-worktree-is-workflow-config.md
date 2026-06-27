# ADR-0012: Worktree Lifecycle Is Workflow-Level Config

## Status

accepted

## Context

In SPEC v1/v2, the worktree lifecycle was step-driven:

- The `run` command created the worktree before the first implementation step.
- The `cleanup` step removed the worktree after PR merge.
- Individual step handlers referenced `run.worktree.workspace_id` for the agent's cwd.

With ADR-0011 (generic agent orchestration), the `cleanup` step handler is deleted. This breaks the worktree removal path. Additionally, non-coding workflows don't need a worktree at all — agents can work directly on `develop`.

## Decision

**Worktree creation/removal is driven by workflow configuration, not step handlers.**

The workflow YAML declares whether it needs a worktree:

```yaml
workflows:
  implement:
    worktree: true # engine creates a worktree when the Run starts
    steps:
      - agent: implementer
      - agent: tester
      - hitl: external
  research:
    worktree: false # agents run on develop, no worktree
    steps:
      - agent: researcher
      - hitl: approve
```

**Lifecycle:**

- **Create:** when a Run enters `running` state, if the workflow has `worktree: true`, the engine calls `deps.createWorktree(beanId)` and stores the result in `run.worktree`.
- **Remove:** when a Run transitions to `closed` (via `close-merged`) or is destroyed (via `reset`), the engine calls `deps.removeWorktree(workspaceId)`.

Individual steps are worktree-agnostic. The engine sets the agent's cwd to the worktree path (if one exists) or to the current directory (if not).

## Consequences

**Positive:**

- **Non-coding workflows don't get worktrees they don't need.**
- **Step handlers don't reference `run.worktree` — they delegate cwd resolution to the engine.**
- **Worktree removal is guaranteed on run termination** — no more orphaned worktrees if `cleanup` is skipped or the workflow doesn't include it.
- **`cleanup` step handler deleted entirely.**

**Negative:**

- **Workflow config carries infrastructure concern.** The workflow author must know whether their workflow needs isolation. This is a reasonable expectation — the author knows whether agents will write files.

## References

- ADR-0011 (generic agent orchestration) — `cleanup` handler deletion requires this lifecycle move
- SPEC-delta-grilling notes (2026-06-27): "worktree is workflow related, not run"
