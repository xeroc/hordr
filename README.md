# Hordr

A herdr plugin that orchestrates a horde of coding agents through beans, worktrees, and workflows.

## What It Does

Hordr sequences agents through workflows with HITL (human-in-the-loop) gates and concurrency limits. It's a **generic agent orchestrator** — the engine doesn't know about commits, tests, or PRs. All domain behavior lives in agent persona text.

### Flow

```
DISCOVERY → DECOMPOSE → IMPLEMENT → FINALIZE
```

1. **Discovery** (outside hordr): a skill on `develop` writes an epic bean (body = spec) + ADRs.
2. **Decompose** (`hordr decompose <epic>`): spawns a planner that creates child task beans. Epic → completed.
3. **Implement** (`hordr run <child>`): creates a worktree (if the workflow requests one), sequences agents through the workflow steps, opens a PR (if the persona says to).
4. **Finalize** (`hordr close-merged`): detects merged PRs, finalizes beans, removes worktrees.

### Step Kinds

Two. That's it.

| Kind    | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| `agent` | Spawn a role-configured agent, wait for `done` or `blocked`.           |
| `hitl`  | Block until external signal (`hordr approve` or `hordr close-merged`). |

### Workflow Example

```yaml
hordr:
  agents:
    implementer:
      harness: opencode
      persona: |
        You implement a single task bean.
        Commit with trailer Refs: <bean-id>.
        Open a PR when done.
    tester:
      harness: opencode
      persona: |
        Run the test plan. Signal blocked if tests fail.
  workflows:
    implement:
      worktree: true
      steps:
        - agent: implementer
        - agent: tester
        - hitl: external
```

## Commands

```
hordr decompose <epic>     Decompose epic into child tasks (stateless)
hordr plan <bean>          Draft spec via planner agent (standalone tasks)
hordr approve <bean>       HITL gate: validate spec, transition to queued
hordr run <bean>           Start workflow (creates worktree if configured)
hordr advance <bean>       Execute one step (idempotent)
hordr supervise <bean>     Blocking loop: advance until terminal/blocked
hordr status               Show all runs + queue depth
hordr drain                Start queued runs up to concurrency limit
hordr reset <bean>         Delete run + worktree + branch
hordr close-merged         Finalize beans whose PRs merged
hordr validate-spec <bean> Check body sections (epic: 6, task: 4)
hordr take <bean>          Focus blocked pane for interactive recovery
```

## Architecture

- **Engine** (`src/engine/`): Run state machine, advance/supervise loop, queue/drain.
- **Harness** (`src/harness/`): Agent resolution, persona injection, pane lifecycle.
- **Herdr** (`src/herdr/`): Thin wrappers around herdr CLI (worktree, pane, wait).
- **Beans** (`src/beans/`): Thin wrappers around beans CLI (status, body, trailer).
- **State** (`src/state/`): Run state files (zod-validated JSON, atomic writes).
- **Config** (`src/config/`): `.beans.yml` parsing + zod validation.
- **Commands** (`src/commands/`): OCLIF command classes — thin wrappers.

Key design decisions: [ADR-0011](docs/adr/0011-generic-agent-orchestration.md) (generic orchestration), [ADR-0012](docs/adr/0012-worktree-is-workflow-config.md) (worktree lifecycle), [ADR-0013](docs/adr/0013-agent-status-is-signal.md) (no output parsing).

## Development

```bash
bun install
bun run build
bun run test
./bin/dev.js --help
```
