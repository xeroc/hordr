# Hordr

A herdr plugin that gives a coding agent an isolated git worktree and a herdr pane, with a bean as its brief. Hordr is **glue, not an orchestrator** — it does not sequence agents through workflows, does not track run state, does not gate on human approval. One `hordr run` is one shot: worktree + pane + agent.

## What hordr does

```
hordr run <bean>
  → beans show <bean>          (validate + read body)
  → herdr worktree create      (isolated checkout, branch bean/<id>)
  → herdr tab create           (fresh pane in the worktree's workspace)
  → herdr pane run "<harness> run -i '<persona + bean body>'"
  → returns. The agent works. The human decides what happens next.
```

That is the whole product. Plus `hordr cleanup <bean>` to tear the worktree back down, and a `hordr daemon` stub (unix socket, `/health` only) kept alive so future agent-facing routes have stable plumbing.

## Key Features

- **Fire-and-forget.** No Run state, no queue, no advance loop, no supervisor pane. `hordr run` is a pure function of (bean, config) → (worktree, pane).
- **Worktree isolation.** Each bean gets `bean/<bean-id>` branched from `develop`. Agents never touch `develop` directly.
- **Bean body is the prompt.** Persona + full bean body inlined verbatim. No `beans show` round-trip from inside the agent, no section extraction.
- **Domain-agnostic.** How to commit, when to open a PR, what "done" means — all of it lives in the agent persona text. Hordr injects no domain knowledge.
- **Agent Companies.** Personas can live in an Agent Companies package (`agents/<role>/AGENTS.md`) instead of a YAML string, with skill composition.
- **Daemon stub.** Unix socket with `/health` only. The plumbing is stable; agent-facing routes slot in later without a redesign.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Commands](#commands)
- [Testing](#testing)
- [Herdr Plugin Integration](#herdr-plugin-integration)
- [Architecture Decision Records](#architecture-decision-records)
- [License](#license)

---

## Tech Stack

| Layer               | Technology                                     |
| ------------------- | ---------------------------------------------- |
| **Language**        | TypeScript 5 (ESM, strict mode)                |
| **CLI Framework**   | OCLIF 4 (`@oclif/core` + `@oclif/plugin-help`) |
| **Validation**      | Zod 3 (config schema, bean envelope)           |
| **YAML Parsing**    | `yaml` 2 (`.beans.yml` config)                 |
| **Package Manager** | Bun (install, build, dev)                      |
| **Test Runner**     | Mocha 11 + Chai 4                              |
| **Linter**          | ESLint 9 (`eslint-config-oclif`)               |
| **Formatter**       | Prettier (`@oclif/prettier-config`)            |

---

## Prerequisites

- **[herdr](https://herdr.dev) 0.7.0+** — terminal workspace manager. Hordr drives panes and worktrees through herdr's socket API.
- **[beans](https://github.com/your-org/beans)** — the issue tracker. Hordr reads bean bodies via `beans show --json`.
- **Bun 1.3+** (recommended) or Node.js 18+.
- **A harness binary** — the agent CLI hordr spawns (`opencode`, `claude`, `codex`, …). Configured per role in `.beans.yml`.
- **git** — for worktree management.

---

## Getting Started

```bash
git clone https://github.com/herdr/hordr.git
cd hordr
bun install
bun run build

# Verify
./bin/run.js --version
./bin/run.js --help

# Link as a herdr plugin
herdr plugin link .
```

### Configure

Hordr reads from `.beans.yml` in your project root:

```yaml
beans:
  path: .beans

hordr:
  primary_branch: develop
  worktree_branch_prefix: bean/
  agents:
    implementer:
      harness: opencode
      persona: |
        You implement a single task bean.
        Read the bean body. Do the work. Commit when done.
        If you cannot complete it, stop and wait for the human.
```

### Run a bean

```bash
# Create a task bean (via the beans CLI)
beans create "Add config validation" -t task -d "$(cat <<'EOF'
## Requirement
We need config validation.

## Spec
Add zod validation to the config loader.

## Acceptance Criteria
- [ ] Invalid config exits non-zero
- [ ] Valid config returns a typed object
EOF
)"

# Hand it to an agent
hordr run hordr-XXXX
# → started hordr-XXXX in bean/hordr-XXXX (role: implementer, pane: wX:pNEW)
```

The agent now runs in its own worktree + pane. Hordr is done. Inspect the work, review the commit, merge or iterate — that's all you.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       CLI Commands                            │
│            src/commands/{run,cleanup,daemon}.ts               │
├──────────────────────────────────────────────────────────────┤
│                       HordrDeps (seam)                        │
│          src/runtime.ts — createWorktree /                    │
│           launchAgent / removeWorktree                        │
├──────────────────┬──────────────┬──────────────┬─────────────┤
│  Harness Layer   │    Herdr     │    Beans     │   Daemon    │
│  (persona +      │ (panes,      │ (read-only:  │ (unix sock  │
│   body → prompt) │  worktrees)  │  getBean)    │  /health)   │
└──────────────────┴──────────────┴──────────────┴─────────────┘
```

The `HordrDeps` interface (`src/runtime.ts`) is the seam: the three operations hordr needs (create a worktree, launch an agent, remove a worktree) are defined there and wired to real herdr/harness calls in `createDeps()`. Tests inject mocks.

### Directory Structure

```
hordr/
├── bin/{run,dev}.js
├── src/
│   ├── commands/{run,cleanup,daemon}.ts
│   ├── beans/client.ts        # getBean, getBody (read-only)
│   ├── config/{schema,loader,index}.ts
│   ├── company.ts             # Agent Companies persona loading
│   ├── daemon/{server,socket}.ts
│   ├── harness/{launcher,index}.ts
│   ├── herdr/{pane,worktree}.ts
│   └── runtime.ts             # HordrDeps + createDeps + test seam
├── test/                      # mirrors src/
├── docs/adr/                  # 8 ADRs
├── .beans.yml
└── herdr-plugin.toml
```

---

## Configuration

`.beans.yml` carries two blocks: `beans:` (the beans CLI config) and `hordr:` (hordr's config).

```yaml
beans:
  path: .beans
  prefix: hordr-
  id_length: 4

hordr:
  primary_branch: develop # worktree base
  worktree_branch_prefix: bean/ # → bean/<bean-id>
  company: # optional — Agent Companies package
    path: /path/to/company #   omit/null to disable
  agents: # role → harness + persona
    implementer: # default role for `hordr run`
      harness: opencode
      persona: |
        You implement a single task bean…
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

### Agent Companies (optional)

When `company.path` is set (or `HORDR_COMPANY` + `HORDR_PROJECT` env vars are), hordr loads personas from `agents/<role>/AGENTS.md` in the package. Each AGENTS.md with a `harness:` frontmatter field overrides the matching role in `.beans.yml`, with declared skills inlined as an `--- Attached Skills ---` block. See [ADR-0007](docs/adr/0007-agent-companies.md).

---

## Commands

| Command                | Description                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `hordr run <bean>`     | Create a worktree, spawn the agent harness in a fresh pane with persona + bean body. Fire-and-forget. |
| `hordr cleanup <bean>` | Remove the worktree for a bean (found by branch). `--force` for unmerged changes.                     |
| `hordr daemon`         | Run the daemon stub (unix socket, `/health` only). Grows agent-facing routes later.                   |

### `hordr run` flags

| Flag            | Default       | Description                                          |
| --------------- | ------------- | ---------------------------------------------------- |
| `--role <name>` | `implementer` | Agent role (must exist in `config.agents`)           |
| `--base <ref>`  | `develop`     | Git base ref for the worktree                        |
| `--json`        | off           | Emit `{bean, branch, pane, role, workspace}` as JSON |

### `hordr cleanup` flags

| Flag      | Default | Description                                            |
| --------- | ------- | ------------------------------------------------------ |
| `--force` | off     | Force-remove even if the worktree has unmerged changes |
| `--json`  | off     | Emit `{bean, branch, removed, workspace}` as JSON      |

---

## The prompt hordr builds

```
<persona text>

---

# Bean <bean-id>

<full bean body, raw markdown, verbatim>
```

The persona is the ONLY place domain knowledge lives — how to commit, whether to open a PR, what "done" means. The bean body is the brief. Hordr does no section extraction, no templating beyond the id and body. The agent interprets the body itself.

---

## Testing

```bash
# Full suite
bun run test

# Specific file
npx mocha test/commands/run.test.ts

# Pattern
npx mocha --grep "run" "test/**/*.test.ts"
```

Mocha + Chai, run through `ts-node/esm` (no build needed). Tests use module-level seams (`_setShellForTesting`, `_setDepsForTesting`) to mock herdr/beans/git.

### Test layout

```
test/
├── commands/   # run, cleanup, (daemon via test/daemon/)
├── beans/      # client (getBean/getBody)
├── config/     # schema + loader
├── harness/    # launcher (buildPrompt, launchAgent)
├── herdr/      # pane, worktree wrappers
├── daemon/     # server (/health stub)
├── company.test.ts
└── runtime.test.ts
```

### Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `bun run build`     | Compile TypeScript to `dist/`            |
| `bun run test`      | Run Mocha test suite + lint (`posttest`) |
| `bun run lint`      | Run ESLint                               |
| `bun run typecheck` | Run `tsc --noEmit`                       |

---

## Herdr Plugin Integration

`herdr-plugin.toml` registers hordr with herdr:

```toml
id = "herdr.hordr"
name = "Hordr"
version = "0.3.0"
min_herdr_version = "0.7.0"
```

### Actions (3)

| Action ID | Command         | Description                        |
| --------- | --------------- | ---------------------------------- |
| `run`     | `hordr run`     | Spawn an agent on a bean           |
| `cleanup` | `hordr cleanup` | Remove a bean's worktree           |
| `daemon`  | `hordr daemon`  | Start the daemon stub (background) |

### No event hooks

Earlier versions wired `worktree.created` / `worktree.removed` hooks. With the engine gone, hordr owns the worktree lifecycle directly via `run`/`cleanup`; herdr-driven hooks would just duplicate that.

### Linking

```bash
herdr plugin link .
herdr plugin list --plugin herdr.hordr
herdr plugin action list --plugin herdr.hordr
```

---

## Troubleshooting

### `hordr run` fails with "no agent configured for role 'X'"

The role isn't in `.beans.yml` under `hordr.agents`. Either add it, or pass `--role <name>` for a role that exists.

### `hordr run` fails with "no persona"

The agent role has no `persona` in `.beans.yml` and no `agents/<role>/AGENTS.md` in the company package (when one is configured). Add one or the other.

### Agent pane not spawning

`herdr` must be running and you must be inside a herdr session:

```bash
herdr status
herdr pane list --json
```

### `hordr cleanup` says "no worktree for X"

The branch `bean/<bean-id>` has no linked worktree. Either it was never created, or herdr already removed it. The git branch may still exist — check with `git branch --list 'bean/*'` and `git branch -d` if stale.

### Worktree creation fails with "branch already exists"

Hordr's recovery path normally handles this (reuses via `herdr worktree open`, or deletes an orphan branch and retries). If it still fails, the branch is probably checked out elsewhere:

```bash
git worktree list          # see where it's linked
git branch --list 'bean/*' # see the branch state
```

---

## Architecture Decision Records

| ADR                                              | Title                                     |
| ------------------------------------------------ | ----------------------------------------- |
| [0001](docs/adr/0001-standalone-herdr-plugin.md) | Standalone OCLIF binary as a herdr plugin |
| [0002](docs/adr/0002-typescript-oclif-zod.md)    | TypeScript + OCLIF + Zod                  |
| [0003](docs/adr/0003-fire-and-forget-run.md)     | Fire-and-forget run model                 |
| [0004](docs/adr/0004-unix-socket-daemon-stub.md) | Unix-socket daemon (stub, grows later)    |
| [0005](docs/adr/0005-worktree-per-bean.md)       | Worktree-per-bean, branch is `bean/<id>`  |
| [0006](docs/adr/0006-bean-body-is-prompt.md)     | Bean body is the agent prompt             |
| [0007](docs/adr/0007-agent-companies.md)         | Agent Companies support                   |
| [0008](docs/adr/0008-no-lifecycle-state.md)      | Hordr owns no lifecycle state             |

---

## License

MIT © Fabian Schuh
