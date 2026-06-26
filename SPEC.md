# Hordr — Specification

> **Status:** Draft v1 — 2026-06-26
> Hordr is a herdr plugin (standalone OCLIF binary, registered via `herdr-plugin.toml`) that orchestrates a horde of coding agents through Beans, git worktrees, and herdr panes.

---

## 1. Overview

Hordr turns each approved bean into an agent-executed PR. The human stays on the `develop` branch, captures requirements as beans, approves specs, and reviews PRs. Hordr handles the rest: worktree creation, agent pane spawning, test execution, commit formatting, and PR opening.

### System boundaries

```
┌─────────────┐        ┌───────────────────────────────────┐        ┌─────────┐
│    Beans     │◄──────│              Hordr                 │──────►│  Herdr  │
│  (bean CLI)  │ status │  (OCLIF binary + herdr plugin)    │ panes  │ (socket)│
│  .beans/*.md │ body   │                                   │ wktree │         │
└─────────────┘        │  ┌─────────┐  ┌────────┐  ┌─────┐ │        └─────────┘
                       │  │ Run SM  │  │ Queue  │  │Steps│ │            │
                       │  └─────────┘  └────────┘  └─────┘ │            ▼
                       │       │                        │   │     ┌──────────┐
                       │       │  $STATE_DIR/*.json     │   │     │ Harness  │
                       └───────┴────────────────────────┴───┘     │ (opencode│
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

Before a bean can leave `draft` (i.e. before `hordr approve` succeeds), the body must contain all four sections with non-empty content:

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

`hordr validate-spec <bean>` checks this programmatically (regex/section parse).

### Workflow assignment

Each bean has a `workflow:` frontmatter field, set during `hordr plan` (defaults to `hordr.routing.default_workflow`). This is the only hordr-owned frontmatter field.

---

## 3. Run state machine

A Run is identified by its bean id (natural key). State persists to `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`.

```
                        hordr plan
  (none) ──────────────────────────────────► planning
                                                 │
                                                 │ planner fills body
                                                 ▼
                                        awaiting-approval
                                                 │
                                          hordr approve
                                                 │
                                    ┌────────────┴────────────┐
                                    │ concurrency full?       │
                                    ▼                         ▼
                                 queued ◄──────────── running (slot freed)
                                    │                         │
                             hordr drain / run           advance loop:
                                    │                    implement → test
                                    ▼                    → review? → commit
                                 running                  → pr → HITL(ext)
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

## 4. Step kinds (closed set, v1)

| Kind              | Agent       | Description                                             | Completion signal                        |
| ----------------- | ----------- | ------------------------------------------------------- | ---------------------------------------- |
| `draft-spec`      | planner     | Planner fills body sections, sets bean → `draft`        | `wait agent-status done` on planner pane |
| `hitl` (approve)  | —           | Blocks until `hordr approve <bean>`                     | Run state transition                     |
| `hitl` (external) | —           | Blocks until external event (e.g. PR merge)             | `hordr close-merged` detects             |
| `implement`       | implementer | Harness runs in worktree root pane                      | `wait agent-status done`                 |
| `test`            | tester      | Harness runs in sibling pane                            | `wait output "test-green\|test-red"`     |
| `review`          | reviewer    | Optional; harness reviews diff                          | `wait agent-status done`                 |
| `commit`          | —           | Implementer commits with trailer `Refs: <prefix><id>`   | Commit created on worktree branch        |
| `pr`              | open_pr     | Harness opens PR via `gh pr create --base develop`      | PR URL in output                         |
| `cleanup`         | —           | Post-merge: bean → `completed`, `herdr worktree remove` | Worktree removed                         |

---

## 5. CLI commands

| Command                      | Description                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `hordr plan <bean>`          | Create a Run, spawn planner pane, draft spec. Bean → `draft`.                         |
| `hordr validate-spec <bean>` | Check 4 body sections. Exit 0 if valid, 1 if not.                                     |
| `hordr approve <bean>`       | HITL gate: validate-spec, then bean `draft` → `todo`. Run → `queued`.                 |
| `hordr run <bean>`           | Enqueue bean; drain queue if slot available. Spawns supervisor pane.                  |
| `hordr advance <bean>`       | Execute the next step. Idempotent — safe to call repeatedly.                          |
| `hordr supervise <bean>`     | Blocking loop: `while not terminal: advance; wait`. Runs in supervisor pane.          |
| `hordr take <bean>`          | Focus the blocked pane for interactive recovery. Run stays `blocked` until `advance`. |
| `hordr status`               | List all Runs with state, step, pane refs. Show queue depth.                          |
| `hordr drain`                | Start queued Runs until concurrency limit.                                            |
| `hordr reset <bean>`         | Delete Run state + worktree + branch. Bean reverts to `todo`.                         |
| `hordr close-merged`         | Scan Runs in `pr-open`; for each merged PR: bean → `completed`, worktree remove.      |

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
  concurrency: 3 # max running + blocked Runs
  primary_branch: develop # worktree base + PR target
  worktree_branch_prefix: bean/ # → bean/<bean-id>
  agents:
    <role>:
      harness: opencode # binary on PATH
      persona: | # opening prompt
        ...
  workflows:
    <name>:
      steps:
        - kind: implement # from closed set
          agent: implementer # references agents.<role>
          optional: false # LLM/handler may skip if true
          pane: root|sibling # where the harness runs
          wait: "regex" # output match that completes the step
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
