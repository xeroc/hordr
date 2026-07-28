# Hordr — Domain Glossary

This glossary defines the canonical vocabulary for talking about hordr's
domain. Every term has a precise meaning; using a term from the _Avoid_ list
in its place creates ambiguity. No implementation details live here — those
belong in the README and code.

---

## Work structure

**Bean**
A unit of work tracked by the beans CLI. A markdown file in `.beans/` with
YAML frontmatter (type, status, priority, assignment) and a body (requirement,
acceptance criteria, summary of changes). Hordr reads and transitions bean
status but does not own the bean format.
_Avoid:_ issue, ticket, work item.

**Milestone**
The root container of a fleet's work. A bean of type `milestone` that groups
epics. One milestone → one fleet → one integration branch. Completes via
rollup when all descendants are completed.
_Avoid:_ release, version, sprint.

**Epic**
A thematic container within a milestone. A bean of type `epic` that groups
tasks. Each unblocked epic gets its own parallel lane. Completes via rollup.
_Avoid:_ feature (different level), story.

**Feature**
An optional intermediate grouping within an epic. A bean of type `feature`.
Useful for large epics that need sub-grouping; skip for simple epics. Tasks
can sit directly under epics.
_Avoid:_ sub-epic, theme.

**Task**
The executable unit of work. A bean of type `task` or `bug`. One task
produces one commit. Only tasks are dispatched to agents; milestones, epics,
and features are containers that complete via rollup.
_Avoid:_ job, action, item (collides with beans generic).

## Runtime entities

**Fleet**
The runtime instance of a team working a milestone. Bounded 1:1:1 — one
milestone → one fleet → one integration branch (`ms/<milestone-id>`). A fleet
exists from `fleet create` to `fleet finish` (or `fleet abort`). It owns no
work-state — only process and placement state (which lanes exist, which panes
are live, which worktrees are allocated).
_Avoid:_ team (the organizational concept), project (collides with the git
project key), swarm.

**Lane**
An epic's parallel workstream within a fleet. A lane bundles one worktree,
one pane, one current task, and a serialized dispatch loop. Lanes are
parallel across epics; tasks within a lane are serialized. Each lane has a
status: `active`, `idle`, `merging`, `conflict`, `done`, `uncommitted`.
_Avoid:_ worker, thread, queue.

**Integration Branch**
The milestone-scoped branch (`ms/<milestone-id>`) created from the primary
branch at fleet creation. Epic branches merge into it; it merges into the
primary branch at fleet finish. Accumulates completed epics' code so
newly-unblocked epics inherit it automatically (lazy creation).
_Avoid:_ develop (that's the primary), base branch, staging.

**Worktree**
An isolated git working directory created and owned by herdr. In fleet mode,
each lane gets its own worktree branched from the integration branch; the
fleet itself has a worktree on the integration branch. In single-bean mode,
each `hordr run` gets a worktree branched from the primary branch. Removed
when the owning merge succeeds.
_Avoid:_ checkout, clone, copy.

**Pane**
A herdr terminal pane where an agent harness runs. Labeled
`hordr:<bean-id>:<role>` (or `hordr:merger` for merger agents). Hordr tracks
pane liveness to detect crashes and merger completion.
_Avoid:_ terminal, window, split, session (collides with harness sessions).

## Roles and agents

**Role**
A named responsibility assigned to a bean via the `assigned:` frontmatter
field. The default roles are: `implementer`, `tester`, `reviewer`, `merger`.
The engine resolves a role to a persona + harness at dispatch time. Roles are
not people — they are job functions that may be filled by different harnesses.
_Avoid:_ agent (the role is the job; the harness is the executor), person.

**Harness**
The binary that executes a role (opencode, claude, codex, etc.). A value
object — hordr launches it in a herdr pane and injects the persona as the
opening prompt. Different roles can use different harnesses; hordr is
harness-agnostic.
_Avoid:_ runtime, engine (collides with the fleet engine), model, provider,
LLM.

**Persona**
The opening prompt text injected into a harness when a pane starts. Defined
per-role in `.beans.yml` or an Agent Companies package. Contains the role's
domain instructions: what to do, how to commit, what "done" means, when to
stop. The worktree's own `AGENTS.md` is not modified by hordr.
_Avoid:_ system prompt (overloaded), character, personality.

## Processes

**Dispatch**
The engine's act of assigning the next ready task to a lane. The dispatchable
set is the intersection of the epic's subtree and `beans list --ready`, sorted
by priority. Dispatch reads the bean's `assigned:` field to resolve the role,
then spawns the harness with the persona + bean body as the prompt.
_Avoid:_ assignment, scheduling, routing.

**Rollup**
The automatic propagation of completion status up the bean tree. When a task
flips to `completed`, the engine walks its ancestry and marks any ancestor
whose children are all completed. Rollup stops at the epic level per-task;
milestone completion is a separate sweep. Rollup writes land as a separate
`chore(beans): rollup status changes` commit.
_Avoid:_ propagation, cascade, promotion.

**Check**
One pass of the fleet dispatch loop: scan for new lanes → heal crashed panes
→ merge completed epics → spawn idle lanes → recover missing worktrees →
complete milestones. The check is idempotent and guarded by a PID-file lock.
Driven by `hordr fleet check` — there is no long-running daemon.
_Avoid:_ tick, cycle, heartbeat, poll.

**Self-heal**
The check's crash recovery mechanism. For each active lane, the check inspects
the current task: if the bean is `completed` (whether via `hordr done` or
forgotten), it proceeds; if the pane is gone and the bean isn't completed
(crash), it resets the task to `todo` for re-dispatch. No wall-clock timeouts.
_Avoid:_ watchdog, health check, monitor.

**Merge Escalation**
The 3-tier strategy for merging branches: (1) `--ff-only` — clean
fast-forward; (2) `--no-ff` — merge commit; (3) conflict left in-progress, a
merger agent is spawned to resolve. Applies to both epic→integration and
integration→primary merges. On any successful tier, the source worktree is
removed and the source branch is deleted.
_Avoid:_ merge strategy, conflict resolution pipeline.

**Merger Agent**
A role-configured agent spawned when a merge hits tier 3 (conflict). Runs in
the target worktree where the conflicted merge is left in-progress. Resolves
conflicts, commits (or aborts), then stops. The check detects completion via
pane-death + git-state checks.
_Avoid:_ conflict resolver, mediator.

## Boundaries

**Primary Branch**
The branch hordr treats as the base for worktrees and the target for fleet
finishes. Configured as `primary_branch` (default: `develop`). Agents never
touch `main`; `main` is release-only.
_Avoid:_ trunk, master, default branch, main.

**Storage Boundary**
The strict separation between beans (work-state) and SQLite (process-state).
Beans hold: bodies, types, statuses, assignments, tree structure — in-repo,
committed. SQLite holds: project registry, fleet/lane rows, pane IDs —
machine-scoped, never committed. Hordr never mirrors bean status into SQLite;
it re-reads `.beans/` on demand. Crash recovery = re-derive from beans.
_Avoid:_ database, state store, cache.

**Agent Companies**
An optional package of version-controlled role definitions. Each role has an
`agents/<role>/AGENTS.md` with frontmatter (`harness:`, etc.) and a body (the
persona). When active, company personas override `.beans.yml` defaults. Also
contains `skills/` and `projects/` directories.
_Avoid:_ team config, org chart.
