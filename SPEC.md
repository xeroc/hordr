# Hordr — Specification

> **Status:** v4 — 2026-07-02 (the "slash": fire-and-forget, no engine/state)
> Hordr is a herdr plugin that gives a coding agent an isolated worktree and a pane, with a bean as its brief. That's it.

---

## 1. Overview

Hordr is **glue, not an orchestrator.** It does not sequence agents through workflows, does not track run state, does not gate on human approval, does not drive a bean to completion. One `hordr run` is one shot: worktree + pane + agent. The agent works; the human decides what happens next.

```
┌─────────────┐        ┌──────────────────────────────┐        ┌─────────┐
│   Beans     │◄───────│            Hordr             │───────►│  Herdr  │
│ (bean CLI)  │  body  │  (OCLIF binary + plugin)     │ panes  │ (socket)│
│ .beans/*.md │        │  run / cleanup / daemon      │ wktree │         │
└─────────────┘        └──────────────────────────────┘        └─────────┘
                                                                    │
                                                                    ▼
                                                              ┌──────────┐
                                                              │ Harness  │
                                                              │ (opencode│
                                                              │  claude…)│
                                                              └──────────┘
```

**Hordr owns:** config parsing, the worktree+pane+launch pipeline, the daemon stub.
**Hordr delegates:** bean reads → `beans` CLI; worktree + pane lifecycle → `herdr` CLI; agent execution → harness binaries; everything else (sequencing, merge gating, parent/child orchestration) → the human.

---

## 2. Commands

Three commands. That's the whole surface.

| Command                | Description                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `hordr run <bean>`     | Create a worktree, spawn the agent harness in a fresh pane with persona + bean body. Returns immediately. |
| `hordr cleanup <bean>` | Remove the worktree hordr created for a bean (found by branch).                                           |
| `hordr daemon`         | Run the daemon stub: unix socket, `GET /health` only. Grows agent-facing routes later.                    |

### `hordr run`

```
hordr run <bean> [--role <name>] [--base <ref>] [--json]
```

- `<bean>` — bean id (required). Hordr reads it via `beans show --json` to validate it exists and to inline its body into the prompt.
- `--role` — agent role (default `implementer`). Must exist in `config.agents`.
- `--base` — git base ref for the worktree (default `config.primary_branch`).
- `--json` — emit `{bean, branch, pane, role, workspace}`.

Steps:

1. `getBean(beanId)` — validates the bean, fetches the body.
2. `deps.createWorktree(beanId, {base?})` — `herdr worktree create`, with recovery for the "branch already exists" and "orphan branch" cases.
3. `deps.launchAgent({beanId, cwd, role, workspaceId})` — `herdr tab create` + `herdr pane run` of `<harness> run -i '<prompt>'`. The prompt is `<persona>\n\n---\n\n# Bean <id>\n\n<body>` (ADR-0006).

Fire-and-forget. Hordr does not wait for the agent, does not advance, does not track status.

### `hordr cleanup`

```
hordr cleanup <bean> [--force] [--json]
```

- Finds the worktree by branch (`<worktree_branch_prefix><beanId>`).
- `herdr worktree open` → `herdr worktree remove`.
- `--force` forwards to remove (for unmerged changes).
- No-op with a message if no worktree exists for the bean.
- The git branch itself is left for `git branch -d` by the human.

### `hordr daemon`

```
hordr daemon [--socket <path>]
```

- Listens on `$HORDR_SOCKET` (default `~/.hordr/hordr.sock`).
- `GET /health` → `{ok: true}`. All other routes → 404 JSON.
- SIGTERM/SIGINT → unlink socket, exit.
- Holds no state. Exists so future agent-facing routes have stable plumbing (ADR-0004).

---

## 3. Configuration

`.beans.yml` → `hordr:` block. Validated by Zod on every invocation.

```yaml
beans:
  path: .beans
  prefix: hordr-
  id_length: 4

hordr:
  primary_branch: develop # worktree base
  worktree_branch_prefix: bean/ # → bean/<bean-id>

  company: # optional — Agent Companies package
    path: /path/to/company #   (omit, or null, to disable)

  agents: # role → harness + persona
    implementer: #   (default role for `hordr run`)
      harness: opencode # binary on PATH
      persona: | # opening prompt — ALL domain behavior lives here
        You implement a single task bean.
        Read the bean body. Do the work. Commit when done.
        If you cannot complete it, stop and wait for the human.
    reviewer:
      harness: opencode
      persona: |
        You review the diff on this branch…
```

| Field                    | Type    | Default   | Description                                            |
| ------------------------ | ------- | --------- | ------------------------------------------------------ |
| `primary_branch`         | string  | `develop` | Base ref for worktrees                                 |
| `worktree_branch_prefix` | string  | `bean/`   | Worktree branch prefix → `bean/<bean-id>`              |
| `company.path`           | string? | —         | Agent Companies package root (enables persona loading) |
| `agents.<role>.harness`  | string  | —         | Harness binary on PATH                                 |
| `agents.<role>.persona`  | string  | —         | Opening prompt; required unless AGENTS.md supplies it  |

Removed in v4: `concurrency`, `workflows`, `routing`. They belonged to the engine layer that no longer exists.

---

## 4. The agent prompt

```
<persona text>

---

# Bean <bean-id>

<full bean body, raw markdown, verbatim>
```

The agent receives its persona (domain instructions: how to commit, what "done" means, when to stop) followed by the complete bean body (requirement, spec, AC, test plan — whatever the bean author wrote). Hordr does no section extraction, no template substitution beyond the bean id and body. The agent is expected to interpret the body itself.

Personas come from one of two places (ADR-0007):

1. `config.agents.<role>.persona` in `.beans.yml`, OR
2. `agents/<role>/AGENTS.md` in the configured Agent Companies package (overrides #1 when a company is active).

Every configured agent must have a persona by the time `loadConfig` returns — otherwise the loader throws.

---

## 5. Project layout

```
hordr/
├── bin/{run,dev}.js          # entry points (prod / ts-node dev)
├── src/
│   ├── commands/
│   │   ├── run.ts            # worktree + pane + harness
│   │   ├── cleanup.ts        # worktree teardown
│   │   └── daemon.ts         # unix-socket stub
│   ├── beans/client.ts       # getBean / getBody (read-only)
│   ├── config/{schema,loader}.ts
│   ├── company.ts            # Agent Companies persona loading
│   ├── daemon/{server,socket}.ts
│   ├── harness/launcher.ts   # buildPrompt + launchAgent
│   ├── herdr/{pane,worktree}.ts
│   └── runtime.ts            # HordrDeps composition + test seam
├── test/                     # mirrors src/ (Mocha + Chai)
├── docs/adr/                 # 8 ADRs
├── .beans.yml                # beans + hordr config
└── herdr-plugin.toml         # herdr plugin manifest
```

---

## 6. Herdr plugin manifest

Hordr registers with herdr via `herdr-plugin.toml`. Three actions (`run`, `cleanup`, `daemon`) appear in herdr's UI; no event hooks (the worktree lifecycle is owned by `hordr run`/`hordr cleanup` directly, not by herdr-driven hooks).

---

## 7. Non-goals

- No workflow sequencing, no multi-step orchestration, no HITL gates.
- No run state, no queue, no concurrency limit.
- No auto-merge, no PR detection, no `close-merged` equivalent.
- No parent/child bean traversal — decomposition lives outside hordr.
- No agent output parsing — the agent's pane is the agent's business.
- No daemon routes beyond `/health` (yet). When agent-facing routes arrive, they will operate on beans/herdr directly, not on a hordr-internal mirror.

---

## 8. Future (when needed)

- Agent-facing daemon routes: `POST /complete`, `POST /fail`, `POST /review-requested` — agents call back over the unix socket instead of stopping silently. Prompt will then bake in the curl commands.
- Worktree branch deletion as part of `cleanup` (currently leaves the branch for `git branch -d`).
- Role-specific worktree bases, multiple harness binaries per role, etc. — all deferred until a real use case appears.
