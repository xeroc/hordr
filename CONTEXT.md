# Hordr

A herdr plugin that manages a horde of coding agents. Hordr reads workflow and agent definitions from `.beans.yml`, drives bean status transitions via the `beans` CLI, and orchestrates worktrees, panes, and agent harnesses via herdr's socket API — turning each approved bean into an isolated, agent-executed PR.

## Language

**Run**:
A single bean's live passage through one workflow. Identified by the bean id (natural key). Owns the current step, worktree reference, pane references, and queue position.
_Avoid_: Execution, job, task (collides with Beans), session (collides with herdr/agent sessions).

**Bean**:
A unit of work tracked by Beans. A markdown file in `.beans/` with frontmatter (status, type, workflow assignment) and a body (requirement, spec, acceptance criteria, test plan). Hordr reads and transitions bean status but does not own the bean format.
_Avoid_: Issue, ticket, work item.

**Workflow**:
A named, ordered list of steps defined in `.beans.yml` under `hordr.workflows`. A definition, not a live execution. Each bean is routed to one workflow via its `workflow:` frontmatter field.
_Avoid_: Pipeline, process.

**Step**:
A single phase within a workflow. Has a kind (draft-spec, hitl, implement, test, review, commit, pr, cleanup), an optional agent role, and a success/wait signal. The set of step kinds is closed in v1.
_Avoid_: Stage, phase.

**Agent (role)**:
A named entry in `hordr.agents` defining a harness and a persona. The role name (implementer, tester, reviewer, planner, open*pr) is the agent's job within a workflow. Distinct from the harness that executes it.
\_Avoid*: Bot, worker, minion.

**Harness**:
The binary that executes an agent role (opencode, hermes, claude, codex, pi, etc.). A value object — hordr launches it in a herdr pane and injects the persona as the opening prompt.
_Avoid_: Runtime, engine, model, provider.

**Persona**:
The opening prompt text injected into a harness when an agent pane starts. Defined per-agent in `.beans.yml`. The worktree's own `AGENTS.md` is not modified by hordr.
_Avoid_: System prompt (overloaded), character.

**Worktree**:
A git worktree created and owned by herdr (`herdr worktree create`). Branched from the primary branch as `bean/<bean-id>`. Hordr references it by herdr workspace id and branch name; it never calls `git worktree` directly.
_Avoid_: Checkout, clone.

**Pane**:
A herdr terminal pane. Hordr labels every pane it spawns with `hordr:<bean-id>:<role>` and resolves panes by label. Herdr pane ids compact on close, so raw ids are never persisted.
_Avoid_: Terminal, window, split.

**Queue**:
The set of Runs whose bean status is `todo` (approved, ready) but which have not yet acquired a concurrency slot. Stored as Run state files with `status: queued`. Drained by `hordr run`, `hordr drain`, and `hordr advance --all`.
_Avoid_: Backlog, pool.

**HITL Gate**:
A workflow step that blocks the Run until a human acts. Two flavors: `approve` (waits for `hordr approve <bean>`) and `external` (waits for an external state change, such as a GitHub PR merge, detected by `hordr close-merged`).
_Avoid_: Checkpoint, approval step (too generic).

**Primary Branch**:
The branch hordr treats as the base for worktrees and the target for PRs. Configured as `hordr.primary_branch` (default: `develop`). Agents never touch `main`; `main` is release-only.
_Avoid_: Trunk, master, default branch.

**Supervisor Pane**:
A herdr pane running `hordr supervise <bean>` — a blocking loop that calls `hordr advance` until the Run reaches a terminal or blocked state. One per active Run. Dies when the Run terminates; can be restarted to resume.
_Avoid_: Daemon, controller, orchestrator process.
