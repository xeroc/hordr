# Hordr — Specification

> **Status:** Draft v3 — 2026-06-27
> Hordr is a herdr plugin (standalone OCLIF binary) that orchestrates a horde of coding agents. It sequences agents through workflows with HITL gates and concurrency limits. Domain-specific behavior (what the agent does — commit, test, PR, research) lives entirely in agent personas, not in engine code.

---

## 1. Overview

Hordr is a **generic agent orchestrator** (ADR-0011). It sequences agents through workflows with HITL gates and concurrency limits. The engine has two step kinds: `agent` (spawn + wait for done/blocked) and `hitl` (block for external signal). All domain-specific behavior — commits, tests, PRs, research methodology — lives in agent persona text, not engine code.

Discovery (spec + ADR authoring) lives **outside** hordr. A skill working on `develop` produces an epic bean (whose body IS the spec) and ADR files. Hordr's role is decomposition (`hordr decompose`) and implementation (`hordr run`).

### End-to-end flow

```
DISCOVERY (outside hordr — skill on develop)
  human + LLM discuss problem, explore edges
  → write ADRs to docs/adr/NNNN-*.md (on develop)
  → create epic bean (body = spec + decision refs)
  git commit on develop: + docs/adr/, + .beans/epic
        │
        ▼
DECOMPOSE (hordr — on develop, no worktree)
  hordr decompose <epic>
  → planner pane reads epic body + ADRs
  → creates N child task beans (--parent <epic>)
  → fills epic's ## Decomposition section
  → epic → completed
        │
        ▼
IMPLEMENTATION (hordr — per child, worktree)
  hordr run <child>   (or hordr drain)
  → worktree: bean/<child-id>
  → implement → test → review → commit → pr
  → child → in-progress
        │
        ▼
FINALIZE (human + hordr)
  human reviews PRs, merges on GitHub
  hordr close-merged
  → child → completed, worktree removed
```

Key: discovery and decomposition happen on `develop`. Only implementation spins off worktrees.

### System boundaries

```
┌─────────────┐        ┌───────────────────────────────────┐        ┌─────────┐
│   Beans     │◄───────│              Hordr                │───────►│  Herdr  │
│ (bean CLI)  │ status │  (OCLIF binary + herdr plugin)    │ panes  │ (socket)│
│ .beans/*.md │ body   │                                   │ wktree │         │
└─────────────┘        │  ┌─────────┐  ┌────────┐  ┌─────┐ │        └─────────┘
                       │  │ Run SM  │  │ Queue  │  │Steps│ │            │
                       │  └─────────┘  └────────┘  └─────┘ │            ▼
                       │       │                        │  │      ┌──────────┐
                       │       │  $STATE_DIR/*.json     │  │      │ Harness  │
                       └───────┴────────────────────────┴──┘      │ (opencode│
                                  config: .beans.yml [hordr]      │ claude...│
                                                                  └──────────┘
```

**Hordr owns:** Run state, queue, workflow engine, step handlers, config parsing, CLI surface.
**Hordr delegates:** bean CRUD → `beans` CLI; worktree lifecycle → `herdr` CLI; agent execution → harness binaries; PR merge → human + GitHub.

---

## 2. Bean lifecycle

Bean status stays coarse (Beans-native). Fine-grained workflow position lives in Run state.

| Bean status   | Body                  | Run state                         | What it means                  |
| ------------- | --------------------- | --------------------------------- | ------------------------------ |
| `todo`        | empty                 | _(none)_                          | Captured, not yet planned      |
| `draft`       | being filled / filled | `planning` → `awaiting-approval`  | Spec drafted, HITL gate active |
| `todo`        | complete              | `queued` or _(none)_              | Approved, ready to run         |
| `in-progress` | complete              | `running` / `blocked` / `pr-open` | Workflow executing or PR open  |
| `completed`   | complete              | `closed`                          | PR merged, worktree removed    |
| `scrapped`    | —                     | —                                 | Abandoned                      |

### Body contract

The body contract is **type-aware** (ADR-0008):

| Bean type     | Required sections                                                                        |
| ------------- | ---------------------------------------------------------------------------------------- |
| `task`, `bug` | Requirement, Spec, Acceptance Criteria, Test Plan (4 sections)                           |
| `epic`        | Requirement, Spec, Decisions, Decomposition, Acceptance Criteria, Test Plan (6 sections) |

**Task/bug body (4 sections):**

```markdown
## Requirement

<what is needed and why>

## Spec

<technical approach, scope, key decisions>

## Acceptance Criteria

- [ ] <testable criterion>
- [ ] <testable criterion>

## Test Plan

<how to verify, including test types and coverage notes>
```

**Epic body (6 sections):**

```markdown
## Requirement

<problem statement — why this epic exists>

## Spec

<full technical spec — scope, user journeys, key flows, constraints.
This IS the spec document. There is no separate specs/ file.>

## Decisions

- [ADR-0007](docs/adr/0007-postgresql.md) — PostgreSQL for durable queue (accepted)
- [ADR-0008](docs/adr/0008-concurrency-model.md) — Token-bucket rate limiter (accepted)

## Decomposition

<!-- filled by hordr decompose; empty until decomposition runs -->

- [ ] bean-id — Child title
- [ ] bean-id — Child title

## Acceptance Criteria

- [ ] <epic-level criterion — integration / end-to-end>

## Test Plan

<integration / E2E verification strategy for the epic as a whole>
```

For epics, `## Decisions` and `## Decomposition` may have empty content (Decisions empty = no ADRs; Decomposition empty = not yet decomposed) but the section headers MUST exist. `## Acceptance Criteria` still requires at least one `- [ ]` checkbox for both types.

`hordr validate-spec <bean>` dispatches on bean type and checks the appropriate contract.

### Lifecycle table additions (ADR-0008, ADR-0010)

| Bean status | Type | Body                               | Run state            | What it means                                                            |
| ----------- | ---- | ---------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `todo`      | epic | spec complete, Decomposition empty | _(none)_             | Created by discovery skill. Ready for `hordr decompose`.                 |
| `completed` | epic | spec + Decomposition filled        | _(none)_             | Decomposed into children. Epic's job is done.                            |
| `todo`      | task | full 4-section                     | _(none)_ or `queued` | Child of an epic (or standalone). Ready for `hordr run`. Skips planning. |

**Decomposed children skip the planning phase entirely** (ADR-0010). No `draft-spec` step, no `awaiting-approval` Run state. `hordr run <child>` creates the Run directly at `queued`. Standalone tasks (not from decomposition) still go through `hordr plan` → `draft-spec` → `awaiting-approval` → `queued` as today.

### Workflow assignment

Each bean has a `workflow:` frontmatter field, set during `hordr plan` (defaults to `hordr.routing.default_workflow`). This is the only hordr-owned frontmatter field.

---

## 3. Run state machine

A Run is identified by its bean id (natural key). State persists to `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`.

**Runs apply to task/bug beans only** (ADR-0009). Epic beans never have a Run — `hordr decompose` is a stateless command.

### Entry paths

There are two ways to enter the Run state machine:

1. **Standalone task** (via `hordr plan`): `(none) → planning → awaiting-approval → queued`
2. **Decomposed child** (via `hordr run <child>`): `(none) → queued` (ADR-0010 — body already complete from decomposition)

```
                      hordr plan                  hordr decompose
                       (task)                       (epic)
  (none) ──────────────────────► planning          │
                                      │            │ creates children
                                      │            │ (todo, full body)
                                      ▼            │
                            awaiting-approval      │
                                      │            ▼
                               hordr approve    ┌──────────┐
                                      │         │  child   │ ← todo, body complete
                           ┌──────────┘         │ (no Run) │
                           ▼                    └────┬─────┘
                        queued ◄─────────────────────┘
                           │                        hordr run <child>
                    hordr drain / run               (creates Run at queued)
                           │
                           ▼
                        running
                           │
                     implement → test → review
                           → commit → pr
                           │           │
                  any step │           │ close-merged
                  can block│           ▼
                           ▼         closed
                        blocked
                           │
                hordr take / hordr reset
                           │
                           ▼
            running (resume) / (none)
```

| Run state           | Bean status      | Supervisor pane | Description                             |
| ------------------- | ---------------- | --------------- | --------------------------------------- |
| _(none)_            | todo             | —               | No Run exists.                          |
| `planning`          | draft            | planner pane    | Planner harness is drafting the spec.   |
| `awaiting-approval` | draft            | _(idle)_        | Spec complete. HITL approve gate.       |
| `queued`            | todo (full body) | —               | Approved, waiting for concurrency slot. |
| `running`           | in-progress      | supervisor pane | Workflow executing.                     |
| `blocked`           | in-progress      | _(idle)_        | Needs human (test-red, gh auth, etc.).  |
| `pr-open`           | in-progress      | _(idle)_        | PR opened. Waiting for GitHub merge.    |
| `closed`            | completed        | —               | Terminal. Worktree removed.             |

---

## 4. Step kinds (ADR-0011)

Two kinds. That's it.

| Kind    | Agent? | Description                                                            | Completion signal                      |
| ------- | ------ | ---------------------------------------------------------------------- | -------------------------------------- |
| `agent` | yes    | Spawn a role-configured agent, wait for `done` or `blocked` (ADR-0013) | Agent's herdr status                   |
| `hitl`  | no     | Block until an external command resolves the gate                      | `hordr approve` / `hordr close-merged` |

**`agent` steps** are configured with `{agent: <role>}`. The engine spawns the harness binary for that role (from `config.agents.<role>.harness`), injects the persona text, and waits. The agent's self-reported herdr status IS the signal — the engine never parses agent output. `done` → advance. `blocked` → run blocks.

**`hitl` steps** are configured with `{hitl: 'approve'}` or `{hitl: 'external'}`. The engine blocks the run until an external command resolves the gate.

All domain-specific behavior (commit trailers, test execution, PR creation, code review, research methodology) lives in the **agent persona** — the opening prompt text defined in `config.agents.<role>.persona`. The engine is domain-agnostic.

### Workflow YAML

```yaml
workflows:
  implement:
    worktree: true # ADR-0012: worktree is workflow-level
    steps:
      - agent: implementer
      - agent: tester
      - agent: reviewer
      - hitl: external # blocks until hordr close-merged
  plan:
    steps:
      - agent: planner
      - hitl: approve # blocks until hordr approve
  research:
    steps: # no worktree — non-coding workflow
      - agent: researcher
      - hitl: approve
```

---

## 5. CLI commands

| Command                      | Description                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `hordr decompose <epic>`     | Stateless (ADR-0009): spawn planner on develop, create child task beans, epic → `completed`.          |
| `hordr plan <bean>`          | Create a Run, spawn planner pane, draft spec. Bean → `draft`. (Standalone task path.)                 |
| `hordr validate-spec <bean>` | **Type-aware:** epics check 6 sections; tasks/bugs check 4. Exit 0 if valid, 1 if not.                |
| `hordr approve <bean>`       | HITL gate: validate-spec, then bean `draft` → `todo`. Run → `queued`.                                 |
| `hordr run <bean>`           | Enqueue bean. Decomposed children (ADR-0010) create Run directly at `queued`. Spawns supervisor pane. |
| `hordr advance <bean>`       | Execute the next step. Idempotent — safe to call repeatedly.                                          |
| `hordr supervise <bean>`     | Blocking loop: `while not terminal: advance; wait`. Runs in supervisor pane.                          |
| `hordr take <bean>`          | Focus the blocked pane for interactive recovery. Run stays `blocked` until `advance`.                 |
| `hordr status`               | List all Runs with state, step, pane refs. Show queue depth.                                          |
| `hordr drain`                | Start queued Runs until concurrency limit.                                                            |
| `hordr reset <bean>`         | Delete Run state + worktree + branch. Bean reverts to `todo`.                                         |
| `hordr close-merged`         | Scan Runs in `pr-open`; for each merged PR: bean → `completed`, worktree remove.                      |

### `hordr decompose` — contract (ADR-0009)

**Preconditions:**

- Bean type is `epic`, status is `todo`.
- Body passes `validate-spec` for epic contract (all 6 sections present).
- Decomposition section is empty (no children yet), unless `--force`.

**Execution:**

1. Spawn planner pane on `develop` (no worktree). Label: `hordr:<epic-id>:planner`.
2. Planner reads epic body + every ADR in `## Decisions`.
3. Planner creates child beans via `beans create "<title>" -t task --parent <epic-id>`.
4. Planner fills epic's `## Decomposition` section.
5. Epic → `completed`.

**Postconditions:**

- N child beans exist with status `todo`, parent `<epic-id>`, complete 4-section bodies.
- Epic status `completed`, Decomposition section lists all children.

**Idempotency:**

- If epic already has children → warn, exit (unless `--force`).
- Planner checks existing children before creating new ones.

### Idempotency

Every step handler is check-then-act:

- **implement**: check if `hordr:<bean>:implementer` pane already exists and is alive → reuse, don't re-spawn.
- **commit**: check if a commit with trailer `Refs: <bean-id>` already exists on the branch → skip.
- **pr**: check if a PR already exists for the branch → skip.
- **test**: always re-run (tests are non-destructive to re-execute).

Pane identity is by label (`hordr:<bean-id>:<role>`), resolved via `herdr pane list` filtered by label. This survives herdr pane-id compaction.

---

## 6. Configuration schema

`.beans.yml` → `hordr:` block. Validated by zod on every invocation.

```yaml
hordr:
  concurrency: 3
  primary_branch: develop
  worktree_branch_prefix: bean/
  agents:
    <role>:
      harness: opencode # binary on PATH
      persona: | # opening prompt — ALL domain behavior lives here
        ...
  workflows:
    <name>:
      worktree: true # ADR-0012: optional, default false
      steps:
        - agent: <role> # spawn agent, wait for done/blocked
        - hitl: approve # block until hordr approve
        - hitl: external # block until hordr close-merged
  routing:
    default_workflow: implement
    plan_workflow: plan
```

---

## 7. Herdr plugin manifest

Registered via `herdr plugin link`. Actions map to `hordr` subcommands. Event hooks fire on `worktree.created` / `worktree.removed`. See `herdr-plugin.toml`.

---

## 8. Project layout

```
hordr/
├── .beans.yml                    # beans config + hordr: block
├── .beans/                       # hordr's own backlog (dogfooded)
├── CONTEXT.md                    # domain glossary
├── SPEC.md                       # this document
├── docs/adr/                     # architecture decisions
├── herdr-plugin.toml             # herdr plugin manifest
├── package.json
├── src/
│   ├── commands/                 # OCLIF command classes (one per CLI command)
│   ├── config/
│   │   └── schema.ts             # zod schema for hordr: block
│   ├── beans/
│   │   └── client.ts             # beans CLI wrapper
│   ├── herdr/
│   │   └── client.ts             # herdr CLI wrapper
│   ├── engine/
│   │   ├── run.ts                # Run state machine
│   │   ├── queue.ts              # queue + concurrency
│   │   ├── advance.ts            # idempotent step executor
│   │   └── steps/                # one handler per step kind
│   │       ├── draft-spec.ts
│   │       ├── hitl.ts
│   │       ├── implement.ts
│   │       ├── test.ts
│   │       ├── review.ts
│   │       ├── commit.ts
│   │       ├── pr.ts
│   │       └── cleanup.ts
│   ├── harness/
│   │   └── launcher.ts           # harness resolution + persona injection
│   └── state/
│       └── run-store.ts          # $STATE_DIR/*.json I/O (zod-validated)
└── test/
```

---

## 9. Non-goals (v1)

- No daemon / background scheduler. All Runs are driven by explicit CLI invocations or supervisor panes. Phase 2.
- No custom bean statuses. Bean status stays Beans-native (`todo/draft/in-progress/completed/scrapped`).
- No multi-tenant or remote operation. Hordr runs locally, talks to local herdr socket and local `beans`.
- No `main` branch operations. `main` is release-only.
- No auto-merge. PR creation is terminal; merge is human + GitHub; `close-merged` finalizes.
- No frontend / board UI. Phase 2 (herdr plugin pane).
- No deploy workflow. Phase 2.
- No open/extensible step kinds. The set of 8 kinds is closed.

---

## 10. Phase 2 (deferred)

- Daemon watcher auto-firing `hordr run` on `ready` beans.
- Horde board pane (herdr `[[panes]]` overlay).
- Frontend/backend/deploy workflow specializations.
- Custom event namespace (`hordr.run.started`, `hordr.run.blocked`).
- Rust port (trigger: stable for one release cycle + desire for static binary).
