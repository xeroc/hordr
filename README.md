# Hordr

> Manage a horde of coding agents through beans, worktrees, and workflows.

Hordr is a standalone [OCLIF](https://oclif.io) CLI binary, written in TypeScript, that registers as a plugin to [herdr](https://github.com/xeroc/hordr) ≥ 0.7.0. It reads workflow and agent definitions from `.beans.yml`, drives bean status transitions via the [`beans`](./AGENTS.md) CLI, and orchestrates worktrees, panes, and agent harnesses via herdr's socket API — **turning each approved bean into an isolated, agent-executed PR**.

Discovery (spec + ADR authoring) happens **outside** hordr; a skill working on `develop` produces an epic bean (whose body _is_ the spec) and ADR files. Hordr's role is decomposition (`hordr decompose`) and implementation (`hordr run`). The human stays on `develop`, captures requirements as epic beans, runs decomposition, and reviews PRs. Hordr handles the rest: worktree creation, agent pane spawning, test execution, commit formatting, and PR opening.

## Key Features

- **Bean-driven workflow** — every unit of work is a bean; hordr never owns the bean format, only transitions its status.
- **Type-aware spec contract** — epics use a 6-section body (incl. `## Decisions` + `## Decomposition`); tasks/bugs use 4 sections. Validated by `hordr validate-spec`.
- **Stateless decomposition** — `hordr decompose <epic>` spawns a planner on `develop`, creates N child task beans, fills the epic's `## Decomposition` section, and marks the epic `completed`. No Run state. (ADR-0009)
- **Children skip planning** — decomposed task beans enter the Run state machine directly at `queued` (no `plan`/`approve` ceremony). (ADR-0010)
- **Closed set of 8 step kinds** — `draft-spec`, `hitl`, `implement`, `test`, `review`, `commit`, `pr`, `cleanup`.
- **Idempotent step execution** — every handler is check-then-act; `hordr advance` is safe to call repeatedly. Crash recovery without a daemon. (ADR-0004)
- **Human-in-the-loop gates** — HITL blocks the Run until `hordr approve <bean>` (spec gate) or `hordr close-merged` (PR-merge gate). Agents never merge their own work. (ADR-0007)
- **Concurrency-limited queue** — `hordr.concurrency` (default `3`) bounds active `running`/`blocked` Runs; `hordr drain` starts queued Runs oldest-first.
- **Herdr-native UX** — every spawned pane is labeled `hordr:<bean-id>:<role>`, resolved by label, so pane-id compaction never corrupts Run state. (ADR-0006)
- **Zod-validated config + state** — the `.beans.yml` → `hordr:` block and every `$STATE_DIR/<bean-id>.json` file are parsed through strict zod schemas.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [How Hordr Fits In](#how-hordr-fits-in)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Run State Machine](#run-state-machine)
- [Step Kinds](#step-kinds)
- [Bean Body Contracts](#bean-body-contracts)
- [CLI Commands](#cli-commands)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Installation & Distribution](#installation--distribution)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Architecture Decision Records](#architecture-decision-records)
- [License](#license)

---

## Tech Stack

- **Language**: TypeScript 5 (ESM, target `es2022`, `strict: true`)
- **Module system**: Node16 module resolution, ESM (`"type": "module"`)
- **CLI framework**: [OCLIF 4](https://oclif.io) (`@oclif/core`, `@oclif/plugin-help`)
- **Runtime**: Node.js ≥ 18 (developed against Bun 1.3.x and Node 26)
- **Package manager**: Bun (`bun.lock`) — npm/yarn also work, but lockfiles for the latter are gitignored
- **Schema validation**: [Zod 3](https://zod.dev)
- **Config format**: YAML (`yaml` parser)
- **Test framework**: Mocha 11 + Chai 4 (`@oclif/test` helpers), via `ts-node/esm`
- **Linting**: ESLint 9 with `eslint-config-oclif` + `eslint-config-prettier`
- **Formatting**: Prettier (`@oclif/prettier-config`)
- **Hooks**: pre-commit 4 (whitespace, gitleaks, conventional-gitmoji, lint, typecheck, test)
- **CI**: GitHub Actions (`pre-commit` workflow, Bun-based)
- **External CLIs hordr shells out to**:
  - [`beans`](./AGENTS.md) — issue tracker (bean CRUD, status, body edits)
  - [`herdr`](https://github.com/xeroc/hordr) ≥ 0.7.0 — worktree + pane + wait primitives
  - `git` — commit (with `Refs: <bean-id>` trailer)
  - `gh` — PR creation / merge detection
  - **agent harnesses** — one binary per role (default: `opencode`)

---

## Prerequisites

Before you can run or develop hordr, you need:

- **Node.js ≥ 18.0.0** (18 LTS, 20 LTS, 22 LTS, or 26 all work).
- **Bun ≥ 1.3** (recommended; used by CI and lockfile). Install via `curl -fsSL https://bun.sh/install | bash`.
- **`beans` CLI on PATH** — hordr never edits `.beans/*.md` directly; every bean read/write goes through `beans`. A missing `beans` binary raises a typed `BeansError` at call time.
- **`herdr` CLI ≥ 0.7.0 on PATH** — for worktree/pane/wait operations. Override with `HERDR_BIN_PATH` (useful in tests).
- **`git` and `gh` on PATH** — for the `commit` and `pr`/`close-merged` steps.
- **One or more agent harness binaries** — the default config ships `opencode` as the harness for every role. Any role whose harness is missing from PATH raises `HarnessError` at launch time.
- **A herdr session** — hordr commands that spawn panes (`decompose`, `plan`, `run` via the supervisor) must be run inside an active herdr session. `herdr pane list` must return at least one pane.

> [!IMPORTANT]
> Hordr is a **CLI plugin**, not a long-running service. There is no daemon, no server port, no database, no Docker image. "Running hordr in production" means "installing the binary globally and registering it as a herdr plugin." See [Installation & Distribution](#installation--distribution).

---

## How Hordr Fits In

```
┌─────────────┐        ┌───────────────────────────────────┐        ┌─────────┐
│   Beans     │◄───────│              Hordr                │───────►│  Herdr  │
│ (bean CLI)  │ status │  (OCLIF binary + herdr plugin)    │ panes  │ (socket)│
│ .beans/*.md │ body   │                                   │ wktree │         │
└─────────────┘        │  ┌─────────┐  ┌────────┐  ┌─────┐ │        └─────────┘
                       │  │ Run SM  │  │ Queue  │  │Steps│ │            │
                       │  └─────────┘  └────────┘  └─────┘ │            ▼
                       │       │                        │  │      ┌──────────┐
                       └───────┴────────────────────────┴──┘      │ Harness  │
                                  config: .beans.yml [hordr]      │ (opencode│
                                                                  │ claude…)│
                                                                  └──────────┘
```

**Hordr owns:** Run state, the queue, the workflow engine, step handlers, config parsing, and the CLI surface.

**Hordr delegates:**

- Bean CRUD → the `beans` CLI (`src/beans/client.ts`)
- Worktree + pane lifecycle → the `herdr` CLI (`src/herdr/*.ts`)
- Agent execution → harness binaries (`src/harness/launcher.ts`)
- PR merge → human + GitHub (`src/engine/close-merged.ts` only _detects_ merges)

### End-to-End Flow

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

Discovery and decomposition happen on `develop`. Only implementation spins off worktrees. `main` is release-only — agents never touch it.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone git@github.com:xeroc/hordr.git
cd hordr
```

### 2. Install Dependencies

Hordr uses Bun for its lockfile and CI. npm/yarn/pnpm also work because the project is a standard OCLIF TypeScript package; only `bun.lock` is committed.

```bash
# recommended (matches CI)
bun install

# or, with any other Node package manager
npm install
# yarn install
# pnpm install
```

### 3. Build the TypeScript Source

OCLIF loads compiled commands from `dist/commands/`. You must build before invoking the released binary:

```bash
bun run build      # shx rm -rf dist && tsc -b
```

> [!TIP]
> For development without rebuilding on every change, use `bin/dev.js`. It runs through `ts-node/esm` against the live `src/` tree:
>
> ```bash
> ./bin/dev.js --help
> ./bin/dev.js status
> ```

### 4. Provide a `.beans.yml`

Hordr searches upward from the current working directory for the first `.beans.yml` containing a top-level `hordr:` block. The repo's own [`.beans.yml`](./.beans.yml) is a complete, working example (hordr dogfoods itself — `.beans/` is its own backlog).

Minimal viable block:

```yaml
beans:
  path: .beans
  prefix: hordr-
  id_length: 4
  default_status: todo
  default_type: task
hordr:
  concurrency: 3
  primary_branch: develop
  worktree_branch_prefix: bean/
  agents:
    implementer:
      harness: opencode
      persona: |
        You are the implementer. Read the bean spec, implement the change, commit with trailer Refs: <bean-id>.
    tester:
      harness: opencode
      persona: |
        You are the tester. Run the test plan and report green/red.
    reviewer:
      harness: opencode
      persona: |
        You are the reviewer. Review the diff for correctness and style.
    planner:
      harness: opencode
      persona: |
        You decompose an epic into independently implementable task beans.
    open_pr:
      harness: opencode
      persona: |
        You open pull requests with trailer Refs: <bean-id>.
  workflows:
    plan:
      steps:
        - kind: draft-spec
          agent: planner
          pane: root
          wait: 'agent-status: done'
        - kind: hitl
    implement:
      steps:
        - kind: implement
          agent: implementer
          pane: root
          wait: 'agent-status: done'
        - kind: test
          agent: tester
          pane: sibling
          wait: 'test-(green|red)'
        - kind: review
          agent: reviewer
          optional: true
          wait: 'agent-status: done'
        - kind: commit
        - kind: pr
          agent: open_pr
          wait: 'pr-url'
        - kind: hitl
          optional: false
  routing:
    default_workflow: implement
    plan_workflow: plan
```

### 5. Verify the External CLIs

```bash
command -v beans   # bean tracker
command -v herdr   # ≥ 0.7.0
command -v gh      # GitHub CLI
command -v git
command -v opencode   # (or whichever harness you configured per role)
```

If any are missing, the corresponding hordr command will raise a typed error (`BeansError`, `HerdrError`, `HarnessError`) at the first call site — hordr fails loudly rather than half-working.

### 6. Smoke Test

```bash
./bin/dev.js --help        # lists all commands
./bin/dev.js status        # reads $HERDR_PLUGIN_STATE_DIR and prints the run table
```

`status` should print `no active runs` if the state directory is empty.

### 7. Link Locally (optional, for herdr plugin development)

To exercise the plugin surface against a real herdr session without publishing to npm:

```bash
bun run build
bun link     # exposes `hordr` on PATH as a symlink to this checkout
# then, in your herdr config, register this repo's herdr-plugin.toml
```

---

## Architecture

### Directory Structure

```
hordr/
├── .beans.yml                 # beans config + the hordr: block (zod-validated)
├── .beans/                    # hordr's own backlog (dogfooded)
├── .github/workflows/
│   └── pre-commit.yml         # CI: Bun-based pre-commit on PR + push to main
├── .pre-commit-config.yaml    # local hooks: lint, typecheck (pre-push: test)
├── AGENTS.md                  # agent contributor guide
├── CONTEXT.md                 # domain glossary (Run, Bean, Workflow, Step, …)
├── SPEC.md                    # the authoritative specification (v2)
├── docs/adr/                  # 10 ADRs (0001–0010)
├── herdr-plugin.toml          # herdr plugin manifest (actions + event hooks)
├── bin/
│   ├── run.js                 # production entry: execute({dir: import.meta.url})
│   └── dev.js                 # dev entry: ts-node/esm against src/
├── src/
│   ├── index.ts               # re-exports @oclif/core run
│   ├── runtime.ts             # createEngineDeps() — wires real impls + test seam
│   ├── commands/              # one OCLIF Command class per CLI subcommand
│   │   ├── advance.ts
│   │   ├── approve.ts
│   │   ├── close-merged.ts
│   │   ├── decompose.ts
│   │   ├── drain.ts
│   │   ├── on-worktree-created.ts   # herdr event hook
│   │   ├── on-worktree-removed.ts   # herdr event hook
│   │   ├── plan.ts
│   │   ├── reset.ts
│   │   ├── run.ts
│   │   ├── status.ts
│   │   ├── supervise.ts
│   │   ├── take.ts
│   │   └── validate-spec.ts
│   ├── config/
│   │   ├── schema.ts          # zod schema for the hordr: block
│   │   ├── loader.ts          # upward .beans.yml search + parse
│   │   └── index.ts
│   ├── state/
│   │   ├── schema.ts          # zod schema for RunState JSON
│   │   ├── run-store.ts       # $STATE_DIR/*.json atomic I/O
│   │   └── index.ts
│   ├── beans/
│   │   ├── client.ts          # synchronous beans CLI wrapper + workflow marker
│   │   ├── trailer.ts         # Refs: <bean-id> commit trailer + PR title helpers
│   │   ├── validate-spec.ts   # type-aware 4-/6-section body validator
│   │   └── index.ts
│   ├── herdr/
│   │   ├── worktree.ts        # herdr worktree create/open/remove + branchFor()
│   │   ├── pane.ts            # pane split/rename/find/list/read/run/close/send
│   │   ├── wait.ts            # herdr wait output + wait agent-status (blocking)
│   │   ├── notify.ts          # herdr notification show (toast)
│   │   └── index.ts
│   ├── harness/
│   │   ├── launcher.ts        # harness resolution + persona injection + pane lifecycle
│   │   ├── test-signal.ts     # scan tester pane output for test-green/test-red
│   │   └── index.ts
│   ├── events/
│   │   └── payload.ts         # parse HERDR_PLUGIN_EVENT_JSON for worktree hooks
│   └── engine/
│       ├── types.ts           # EngineDeps interface + STUB_DEPS
│       ├── run.ts             # pure transition() + ALLOWED_TRANSITIONS table
│       ├── queue.ts           # enqueue/drain + capacity + spawnSupervisor
│       ├── advance.ts         # idempotent single-step executor
│       ├── supervise.ts       # blocking loop (advance + sleep) for supervisor panes
│       ├── close-merged.ts    # scan pr-open runs, detect GitHub merges
│       ├── index.ts
│       └── steps/             # one handler per step kind
│           ├── shared.ts      # StepError, DEFAULT_ROLE, launchOrReuse()
│           ├── draft-spec.ts
│           ├── hitl.ts
│           ├── implement.ts
│           ├── test.ts
│           ├── review.ts
│           ├── commit.ts
│           ├── pr.ts
│           ├── cleanup.ts
│           └── index.ts       # STEP_HANDLERS registry
└── test/                      # Mocha specs mirroring src/ layout
    ├── beans/ commands/ config/ engine/ harness/ herdr/ state/
    ├── engine/helpers.ts      # makeRun() / makeDeps() test factories
    └── tsconfig.json
```

### Request / Command Lifecycle

Hordr is a CLI, not a server — there is no inbound request stack. The lifecycle of a single `hordr <command>` invocation is:

1. **OCLIF boot** — `bin/run.js` calls `execute({dir: import.meta.url})`. OCLIF scans `dist/commands/` for Command classes, parses argv, and instantiates the matching command.
2. **Dependency wiring** — the command calls `getDeps()` (`src/runtime.ts`), which returns either the real `createEngineDeps()` (production) or a test-injected override.
3. **Config load** — `loadConfig()` walks upward from `process.cwd()` for `.beans.yml`, parses the `hordr:` block through `HordrConfigSchema`, and returns the typed config. On any failure it raises `ConfigError` with the offending path.
4. **Engine work** — depending on the command, the engine is invoked:
   - `advance(beanId, deps)` reads the Run, dispatches to the current step's handler via `STEP_HANDLERS[step.kind]`, applies the handler's `runPatch`, bumps `step` if `done`, and persists via `putRun`.
   - `enqueue(beanId, deps)` / `drain(deps, spawn)` mutate Run status within the `ALLOWED_TRANSITIONS` table and fire-and-forget the supervisor pane spawn.
5. **Side effects** — handlers shell out to `beans`, `herdr`, `git`, or `gh` via the synchronous wrappers in `src/beans/`, `src/herdr/`, and inline in `commit`/`pr`.
6. **Persist + exit** — `putRun` writes Run state atomically (write-to-`.tmp`, rename). Commands print human or `--json` output and exit.

### Data Flow

```
human            hordr CLI                       beans CLI    herdr CLI    harness
 │                  │                               │            │           │
 │ hordr run X      │                               │            │           │
 │─────────────────►│ getBean, validateSpec         │            │           │
 │                  │──────────────────────────────►│            │           │
 │                  │ putRun(queued) + spawn superv. │            │           │
 │                  │                               │            │           │
 │                  │ supervise X (detached pane)   │            │           │
 │                  │ ── advance loop ──            │            │           │
 │                  │   implement: launchAgent ──────────────────►│ run opencode ──►
 │                  │   waitForAgentDone ◄────────────────────────│ wait agent-status │
 │                  │   test:      launchAgent (sibling) ────────►│ run opencode ──►
 │                  │   detectTestSignal (readPane) ◄─────────────│                  │
 │                  │   commit:    git commit --trailer=Refs: X   │                  │
 │                  │   pr:        gh pr list / launchAgent ──►  │                  │
 │                  │   hitl(external): status → pr-open, block   │                  │
 │                  │                                                               │
 │ merge on GitHub  │                                                               │
 │────────────────────────────────────────────────────────────────────────────────►│
 │                  │                                                               │
 │ hordr close-merged│                                                              │
 │─────────────────►│ gh pr view --json state,mergedAt                            │
 │                  │ setStatus(X, completed); removeWorktree; putRun(closed)      │
```

### Key Components

**`src/config/`** — `.beans.yml` discovery and validation. `loadConfig()` does an upward search to `/` (the first `.beans.yml` wins), parses through `HordrConfigSchema`, and returns a typed `HordrConfig`. Every field has a sensible default (`concurrency: 3`, `primary_branch: 'develop'`, `worktree_branch_prefix: 'bean/'`).

**`src/state/`** — Run persistence. `putRun` does atomic writes (`*.json.tmp-<pid>-<rand>` → rename). `getRun`/`listRuns` validate through `RunStateSchema` on every read, so a corrupted state file raises `StateError` instead of silently spreading bad data.

**`src/beans/client.ts`** — synchronous wrapper around the `beans` CLI. The notable wrinkle: the `beans` CLI exposes **no** frontmatter setter for `workflow:`, so hordr persists the workflow assignment as an HTML comment marker (`<!-- hordr:workflow=implement -->`) inside the bean body. Hordr is the only reader/writer of this marker; beans remains the sole authority on disk.

**`src/herdr/`** — four modules wrapping herdr's CLI surface:

- `worktree.ts` — `createWorktree`, `openWorktree`, `removeWorktree`, `branchFor(beanId, prefix)` → `bean/<bean-id>`.
- `pane.ts` — `splitPane`, `splitLabeled` (split + rename in one call), `findPane` (existence check via `pane get`), `listPanes`, `readPane`, `runInPane`, `sendText`, `closePane`.
- `wait.ts` — `waitOutput` (regex match on pane content) and `waitAgentStatus` (block until `done`/`blocked`/…). Both block synchronously — hordr is a CLI, blocking is fine.
- `notify.ts` — fire-and-forget herdr toasts.

> [!NOTE]
> ADR-0006 specifies pane identity by label, but herdr CLI v0.7.0 cannot _query_ labels back. Hordr tracks pane_ids in `run.panes: Record<role, pane_id>` and sets labels only for human UX in the TUI. The `findPane(workspaceId, paneId)` signature is kept for API compatibility with the spec; the `workspaceId` arg is unused because pane_ids (`wJ:p2`) carry their workspace prefix.

**`src/harness/launcher.ts`** — the four-step launch sequence:

1. `resolveHarness(role, config)` — look up `agents.<role>.harness`, verify on PATH.
2. `buildOpeningPrompt(role, config, beanId)` — concatenate the persona with the bean's `## Requirement` and `## Acceptance Criteria` sections.
3. `splitLabeled({cwd: <worktree>, direction: 'right', label: 'hordr:<bean-id>:<role>', parentPaneId})`.
4. `runInPane(pane, harness)` then `sendText(pane, prompt)` (no Enter — the harness reads stdin).

**`src/engine/`** — the workflow engine. The core abstraction is `EngineDeps` (`src/engine/types.ts`): seven methods (`createWorktree`, `detectTestSignal`, `launchAgent`, `paneExists`, `readAgentOutput`, `removeWorktree`, `waitForAgentDone`). `src/runtime.ts` wires the real implementations; tests pass mocks via `_setDepsForTesting`.

### The `EngineDeps` Test Seam

Every external side effect funnels through `EngineDeps`. This is the single most important architectural decision for testability:

```ts
// src/runtime.ts
export function getDeps(): EngineDeps {
  return _override ?? createEngineDeps()
}
```

Commands call `getDeps()`. Tests call `_setDepsForTesting(makeDeps({detectTestSignal: () => 'red'}))` to inject fakes. `STUB_DEPS` (in `src/engine/types.ts`) is the all-throwing base; tests override only the methods they exercise.

### Idempotency

Every step handler is check-then-act, so `hordr advance` is safe to call repeatedly:

- **implement / test / review / draft-spec / pr** — `launchOrReuse()` checks `run.panes[role]` and `paneExists()` before spawning; existing live panes are reused.
- **commit** — `git log --grep=<trailer>` before committing; skip if a commit already exists.
- **pr** — `gh pr list --head <branch>` before launching `open_pr`; skip if a PR exists.
- **hitl** — both flavors just return `{block: true, done: false}`; the transition out is driven by an external command (`approve` / `close-merged`).

This is how hordr gets crash recovery without a daemon (ADR-0004): kill a supervisor pane, re-run `hordr advance <bean>`, and it picks up where it left off.

---

## Configuration

Hordr's config lives under the top-level `hordr:` key in `.beans.yml`. The schema is defined in [`src/config/schema.ts`](./src/config/schema.ts) and validated by zod on every invocation.

### Schema Reference

| Path                             | Type               | Default      | Description                                                                                |
| -------------------------------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------ |
| `hordr.concurrency`              | positive integer   | `3`          | Max simultaneous `running` + `blocked` Runs. Bounds the active set; queued Runs wait.      |
| `hordr.primary_branch`           | non-empty string   | `develop`    | Base for worktrees and target for PRs. Agents never touch `main`.                          |
| `hordr.worktree_branch_prefix`   | non-empty string   | `bean/`      | Prepended to bean id → worktree branch (e.g. `bean/hordr-1234`).                           |
| `hordr.agents.<role>.harness`    | non-empty string   | _(required)_ | Harness binary on PATH (e.g. `opencode`, `claude`, `codex`).                               |
| `hordr.agents.<role>.persona`    | non-empty string   | _(required)_ | Opening prompt text injected when an agent pane starts.                                    |
| `hordr.workflows.<name>.steps[]` | array of `StepDef` | _(required)_ | Ordered list of steps. Each step has `kind`, optional `agent`, `optional`, `pane`, `wait`. |
| `hordr.routing.default_workflow` | non-empty string   | _(required)_ | Workflow assigned to beans during `hordr run` (e.g. `implement`).                          |
| `hordr.routing.plan_workflow`    | non-empty string   | _(required)_ | Workflow assigned during `hordr plan` (e.g. `plan`).                                       |

### Step Definition (`StepDef`)

| Field      | Type                                                                                         | Default          | Notes                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `kind`     | `draft-spec` \| `hitl` \| `implement` \| `test` \| `review` \| `commit` \| `pr` \| `cleanup` | _(required)_     | Must be one of the closed set of 8.                                                                                                           |
| `agent`    | string                                                                                       | _role-defaulted_ | References `agents.<role>`. Defaults per kind: `draft-spec→planner`, `implement→implementer`, `test→tester`, `review→reviewer`, `pr→open_pr`. |
| `optional` | boolean                                                                                      | `false`          | For `review`: skip entirely if no pane exists yet. Other kinds: harness may skip.                                                             |
| `pane`     | `root` \| `sibling`                                                                          | —                | Where the harness runs. `sibling` is used by the tester.                                                                                      |
| `wait`     | string                                                                                       | —                | Output/status match that completes the step. e.g. `agent-status: done`, `test-(green                                                          | red)`, `pr-url`. |

### Config Discovery

`loadConfig(pathArg?)` walks upward from `process.cwd()` (or the provided path) until it finds a `.beans.yml` containing a top-level `hordr:` key. The first match wins. If no config is found, a `ConfigError('No hordr config found')` is raised.

### Workflow Assignment (frontmatter workaround)

The `beans` CLI has no `--workflow` flag and no `workflow` field in its on-disk frontmatter. Hordr persists the assignment as an HTML comment marker appended to the bean body:

```markdown
<!-- hordr:workflow=implement -->
```

`getWorkflow(beanId)` reads it back with one regex. Hordr is the only reader/writer of this marker; `beans` remains the sole authority on the file. This is documented in [`src/beans/client.ts`](./src/beans/client.ts).

---

## Run State Machine

A **Run** is a single bean's live passage through one workflow. Identified by the bean id (natural key — ADR-0002). State persists to `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`.

> [!IMPORTANT] > **Runs apply to task/bug beans only** (ADR-0009). Epics never have a Run — `hordr decompose` is a stateless command.

### Transition Table

`ALLOWED_TRANSITIONS` (in [`src/engine/run.ts`](./src/engine/run.ts)) defines the legal state changes. Self-transitions are allowed (idempotent re-writes). `running → closed` is intentionally absent — closure goes through `pr-open → closed` (via `close-merged`) or `blocked → running` (via reset/recovery).

| From                | To                                        |
| ------------------- | ----------------------------------------- |
| `planning`          | `planning`, `awaiting-approval`           |
| `awaiting-approval` | `awaiting-approval`, `planning`, `queued` |
| `queued`            | `queued`, `running`                       |
| `running`           | `running`, `blocked`, `pr-open`           |
| `blocked`           | `blocked`, `running`                      |
| `pr-open`           | `pr-open`, `closed`                       |
| `closed`            | `closed` _(terminal)_                     |

Any other transition raises `TransitionError`.

### Entry Paths

There are two ways to enter the Run state machine:

1. **Standalone task** (via `hordr plan`): `(none) → planning → awaiting-approval → queued`.
2. **Decomposed child** (via `hordr run <child>`): `(none) → queued` (ADR-0010 — the body is already complete from decomposition, so planning is skipped).

### State × Bean Status Matrix

| Run state           | Bean status   | Supervisor pane | Description                               |
| ------------------- | ------------- | --------------- | ----------------------------------------- |
| _(none)_            | `todo`        | —               | No Run exists yet.                        |
| `planning`          | `draft`       | planner pane    | Planner is drafting the spec.             |
| `awaiting-approval` | `draft`       | _(idle)_        | Spec complete. HITL approve gate active.  |
| `queued`            | `todo`        | —               | Approved, waiting for a concurrency slot. |
| `running`           | `in-progress` | supervisor pane | Workflow executing.                       |
| `blocked`           | `in-progress` | _(idle)_        | Needs human (`test-red`, `gh` auth, …).   |
| `pr-open`           | `in-progress` | _(idle)_        | PR opened. Waiting for GitHub merge.      |
| `closed`            | `completed`   | —               | Terminal. Worktree removed.               |

### On-Disk Format

Each Run is one JSON file at `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`. The schema (`RunStateSchema` in [`src/state/schema.ts`](./src/state/schema.ts)):

```jsonc
{
  "bean": "hordr-1234",
  "status": "running",
  "workflow": "implement",
  "step": 2, // index into workflow.steps[]
  "started_unix": 1719500000,
  "updated_unix": 1719500123,
  "panes": {
    "implementer": "wJ:p2",
    "tester": "wJ:p3",
  },
  "worktree": {
    "branch": "bean/hordr-1234",
    "workspace_id": "wJ",
    "path": "/code/hordr-wt/bean/hordr-1234",
    "removed": false,
  },
}
```

Field names are `snake_case` to match the SPEC §3 on-disk contract; the relevant source files carry `/* eslint-disable camelcase */` pragmas.

> [!NOTE]
> The `worktree.removed` flag is set by the `on-worktree-removed` event hook when herdr removes the worktree out-of-band. The branch is preserved so `close-merged` can still find the PR by branch name; handlers skip herdr calls against a removed workspace.

---

## Step Kinds

The set of step kinds is **closed at 8** for v1 (SPEC §9 non-goal: no extensible step kinds). Defined in [`src/engine/steps/`](./src/engine/steps/).

| Kind         | Default agent | Description                                                                                                          | Completion signal                              |
| ------------ | ------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `draft-spec` | `planner`     | Planner fills body sections, sets bean → `draft`. Run → `awaiting-approval`.                                         | `wait agent-status done` on planner pane.      |
| `hitl`       | —             | Blocks until external action. `approve` flavor: waits for `hordr approve`. `external` flavor: waits for PR merge.    | Run state transition.                          |
| `implement`  | `implementer` | Harness runs in worktree root pane.                                                                                  | `wait agent-status done`.                      |
| `test`       | `tester`      | Harness runs in sibling pane. On red or null signal → Run `blocked`.                                                 | `test-green` advances; `test-red`/null blocks. |
| `review`     | `reviewer`    | Optional. If `step.optional && !run.panes[role]` → skip entirely.                                                    | `wait agent-status done`.                      |
| `commit`     | —             | `git add -A && git commit --trailer=Refs:\ <bean-id>`. Idempotent on trailer; falls back to unsigned on GPG failure. | Commit created on worktree branch.             |
| `pr`         | `open_pr`     | `gh pr list --head <branch>` first; if absent, launch `open_pr` agent. Sets status → `pr-open`.                      | PR URL in output.                              |
| `cleanup`    | —             | Post-merge: bean → `completed`, `removeWorktree`. Run → `closed`.                                                    | Worktree removed.                              |

### Test Signal Fail-Safe

The tester step (`src/engine/steps/test.ts`) treats **`null` as red**. After `waitForAgentDone` returns, `detectTestSignal(paneId)` scans the pane output for the literals `test-red` / `test-green` (case-sensitive). Red is checked first, so a pane containing both literals fails safe. This is load-bearing — do not reorder the checks.

---

## Bean Body Contracts

The body contract is **type-aware** (ADR-0008). Validated by [`hordr validate-spec`](./src/beans/validate-spec.ts), which dispatches on bean type.

### Task / Bug Body (4 sections)

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

### Epic Body (6 sections)

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

For epics, `## Decisions` and `## Decomposition` may have empty bodies (Decisions empty = no ADRs; Decomposition empty = not yet decomposed) but **the section headers MUST exist**. `## Acceptance Criteria` requires at least one `- [ ]` checkbox for both types.

---

## CLI Commands

Every command accepts `--json` for machine-readable output (parsed easily in scripts and other agents). Non-zero exit codes: `0` success, `1` validation/spec failure, `2` usage/precondition error.

| Command                        | Description                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `hordr decompose <epic>`       | Stateless (ADR-0009): spawn planner on develop, create child task beans, fill `## Decomposition`, epic → `completed`. |
| `hordr plan <bean>`            | Create a Run, spawn planner pane, draft spec. Bean → `draft`. (Standalone task path.)                                 |
| `hordr validate-spec <bean>`   | Type-aware: epics check 6 sections; tasks/bugs check 4. Exit 0 if valid, 1 if not.                                    |
| `hordr approve <bean>`         | HITL gate: validate-spec, then bean `draft` → `todo`. Run → `queued`.                                                 |
| `hordr run <bean>`             | Enqueue bean. Decomposed children (ADR-0010) create the Run directly at `queued`. Spawns the supervisor pane.         |
| `hordr advance [bean] [--all]` | Execute the next step. Idempotent — safe to call repeatedly. `--all` advances every non-terminal run.                 |
| `hordr supervise <bean>`       | Blocking loop: `while not terminal: advance; sleep`. Runs in the supervisor pane.                                     |
| `hordr take <bean>`            | Focus (`pane zoom --on`) the blocked pane for interactive recovery. Run stays `blocked` until `advance`.              |
| `hordr status`                 | List all Runs with state, step, pane refs. Shows queue depth (`active/capacity`, `queued`).                           |
| `hordr drain`                  | Start queued Runs (oldest first) until the concurrency limit.                                                         |
| `hordr reset <bean>`           | Delete Run state + worktree + branch. Bean reverts to `todo`. Prompts unless `--force`.                               |
| `hordr close-merged`           | Scan Runs in `pr-open`; for each merged PR: bean → `completed`, `removeWorktree`, Run → `closed`.                     |

Plus two herdr event hooks (not invoked directly by humans):

| Command                     | Description                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `hordr on-worktree-created` | Fired by herdr on `worktree.created`. Updates the matching Run's worktree field if the branch is a hordr branch.        |
| `hordr on-worktree-removed` | Fired by herdr on `worktree.removed`. Sets `worktree.removed = true` on every Run sharing the workspace_id. Idempotent. |

<!-- usage -->
<!-- usagestop -->

### Common Workflows

**Decompose an epic into runnable children:**

```bash
hordr validate-spec hordr-1t2j          # epic body must pass the 6-section contract
hordr decompose hordr-1t2j              # planner creates children; epic → completed
hordr status                            # children are todo, no Runs yet
```

**Run a decomposed child (the fast path — ADR-0010):**

```bash
hordr run hordr-ab12                    # creates Run at queued; spawns supervisor if a slot is free
hordr status                            # watch it move through running → pr-open
```

**Run a standalone task (the plan/approve path):**

```bash
hordr plan hordr-cd34                   # planner drafts spec; Run → awaiting-approval
hordr validate-spec hordr-cd34          # sanity-check before approving
hordr approve hordr-cd34                # bean → todo, Run → queued
hordr run hordr-cd34                    # spawns supervisor
```

**Drain a backlog and finalize merges:**

```bash
hordr drain                             # start queued Runs until concurrency limit
hordr status
# …human reviews and merges PRs on GitHub…
hordr close-merged                      # mark merged beans completed, remove worktrees
```

**Recover a blocked Run:**

```bash
hordr status                            # see which Runs are blocked
hordr take hordr-ef56                   # focus the blocked pane in herdr
# …fix the issue interactively in the focused pane…
hordr advance hordr-ef56                # resume the workflow
```

---

## Environment Variables

### Required for Normal Operation

| Variable                 | Description                                                   | How to Get / Default                                                          |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `HERDR_PLUGIN_STATE_DIR` | Directory hordr writes Run state files to (`<bean-id>.json`). | Set by herdr when invoking the plugin. Fallback: `./.hordr-state` (dev only). |

### Optional / Override

| Variable                  | Description                                                                                      | Default    |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| `HERDR_BIN_PATH`          | Override the `herdr` binary path (also overrides the supervisor spawn target). Useful for tests. | `herdr`    |
| `HERDR_PLUGIN_EVENT`      | Set by herdr on event hooks (e.g. `worktree.created`). Read via `readWorktreeEvent()`.           | _(unset)_  |
| `HERDR_PLUGIN_EVENT_JSON` | JSON payload for event hooks. Required by `on-worktree-created` / `on-worktree-removed`.         | _(unset)_  |
| `HERDR_PLUGIN_ID`         | Plugin id, as provided by herdr.                                                                 | _(unset)_  |
| `EDITOR`                  | Used by `git commit` (if it ever drops into an editor; hordr always passes `-m`).                | _(system)_ |

> [!WARNING]
> In production, **always** let herdr set `HERDR_PLUGIN_STATE_DIR` when invoking the plugin. The `./.hordr-state` fallback exists only for local development and tests; relying on it in a real session will scatter state files across whatever directory you happen to be in.

There is **no** `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY_BASE`, or similar — hordr is stateless aside from the JSON state files, has no network listener, and performs no cryptography.

---

## Available Scripts

Defined in [`package.json`](./package.json). Run with `bun run <script>` (or `npm run <script>`).

| Script      | Command                                   | Description                                                                                      |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `build`     | `shx rm -rf dist && tsc -b`               | Compile `src/` → `dist/`. Required before invoking `bin/run.js`.                                 |
| `lint`      | `eslint`                                  | Lint with `eslint-config-oclif` + `eslint-config-prettier`.                                      |
| `typecheck` | `tsc --noEmit`                            | Type-check without emitting. Runs in pre-commit.                                                 |
| `test`      | `mocha --forbid-only "test/**/*.test.ts"` | Full Mocha suite. Runs in pre-push.                                                              |
| `prepack`   | `oclif manifest && oclif readme`          | Generates `oclif.manifest.json` and updates command docs in README. Run by `npm pack`/`publish`. |
| `postpack`  | `shx rm -f oclif.manifest.json`           | Clean up the manifest after packing.                                                             |
| `posttest`  | `bun run lint`                            | Lint after every test run.                                                                       |
| `version`   | `oclif readme && git add README.md`       | Refresh command docs on `npm version`.                                                           |

---

## Testing

Hordr's tests are Mocha + Chai, executed through `ts-node/esm` against the TypeScript source (no build step required). Configuration lives in [`.mocharc.json`](./.mocharc.json): 60s timeout, spec reporter, recursive, `--forbid-only` (CI safety).

### Running Tests

```bash
# full suite
bun run test

# a single file
bunx mocha test/engine/advance.test.ts

# a single describe/it block
bunx mocha test/engine/advance.test.ts --grep "transitions"

# with lint (runs automatically via posttest)
bun run test && bun run lint
```

### Test Layout

```
test/
├── beans/           # client, trailer, validate-spec
├── commands/        # one per OCLIF command + manifest + event-hooks
├── config/          # schema
├── engine/          # run, queue, advance, supervise, close-merged, steps/*
│   └── helpers.ts   # makeRun() / makeDeps() factories
├── harness/         # launcher, test-signal
├── herdr/           # pane, wait, worktree
├── state/           # run-store
└── tsconfig.json    # extends root, noEmit
```

### Test Seams (the `_set*ForTesting` pattern)

Every synchronous shell-out module exposes a test seam:

```ts
// src/beans/client.ts
export function _setShellForTesting(fn: ShellFn): void
export function _setBeansPresentForTesting(present: boolean): void
export function _resetShell(): void
```

The same pattern appears in `src/herdr/{worktree,pane,wait,notify}.ts`, `src/harness/launcher.ts` (`_setWhichForTesting`, `_setListPanesForTesting`), `src/engine/close-merged.ts` (`_setGhForTesting`), `src/engine/steps/pr.ts` (`_setGhForTesting`), and `src/runtime.ts` (`_setDepsForTesting`).

Tests record shell calls and feed canned responses:

```ts
// test/beans/client.test.ts
let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (cmd, args, _opts) => {
  const c = {args, cmd}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected shell call: ${cmd} ${args.join(' ')}`)
}

beforeEach(() => {
  calls = []
  responder = null
  _setShellForTesting(mockShell)
  _setBeansPresentForTesting(true)
})
```

### Writing a Test

Engine-level tests use the `makeRun` / `makeDeps` factories in [`test/engine/helpers.ts`](./test/engine/helpers.ts):

```ts
import {expect} from 'chai'
import {advance} from '../../src/engine/advance.js'
import {makeDeps, makeRun} from './helpers.js'
import {putRun} from '../../src/state/run-store.js'

it('blocks the run when the tester reports red', () => {
  const run = makeRun({bean: 'hordr-red', step: 1, status: 'running', workflow: 'implement'})
  putRun(run)
  const deps = makeDeps({detectTestSignal: () => 'red'})

  const result = advance('hordr-red', deps)

  expect(result.block).to.equal(true)
})
```

Command-level tests stub `process.stdout.write`/`stderr.write`, pass a minimal `Config` to the OCLIF `Command` constructor, and invoke `cmd.run()` directly — see [`test/commands/run.test.ts`](./test/commands/run.test.ts) for the pattern.

> [!TIP]
> Tests that exercise the supervisor spawn redirect the binary via `HERDR_BIN_PATH=/bin/true` so the detached child no-ops instead of trying to start a real `hordr supervise`.

---

## Installation & Distribution

Hordr is a CLI plugin distributed as an npm package. There is **no** server, container, or runtime to deploy.

### From npm (end users)

```bash
npm install -g hordr
```

The `bin` entry in [`package.json`](./package.json) (`"hordr": "./bin/run.js"`) exposes the `hordr` command globally.

### From source (contributors)

```bash
git clone git@github.com:xeroc/hordr.git
cd hordr
bun install
bun run build
bun link           # makes `hordr` on PATH resolve to this checkout
```

### Registering as a herdr Plugin

Hordr ships a [`herdr-plugin.toml`](./herdr-plugin.toml) manifest declaring its actions (mapped 1:1 to `hordr` subcommands) and event hooks (`worktree.created` → `hordr on-worktree-created`, `worktree.removed` → `hordr on-worktree-removed`). Register it with herdr's plugin mechanism (see herdr's docs for `herdr plugin link`).

Minimum herdr version: **0.7.0** (`min_herdr_version` in the manifest). Supported platforms: **linux** and **macos**.

### Publishing a New Version

```bash
# 1. bump version (this also regenerates command docs in README.md via `oclif readme`)
npm version patch    # or minor / major

# 2. build + pack + publish
npm run build
npm publish
```

`prepack` generates `oclif.manifest.json` and refreshes the command-doc markers in this README; `postpack` cleans up the manifest. The `files` array in `package.json` ensures only `bin/`, `dist/`, and `oclif.manifest.json` are published.

> [!CAUTION] > `oclif readme` (run by `prepack` and the `version` script) updates only the content between the `<!-- usage -->` / `<!-- usagestop -->` and `<!-- commands -->` / `<!-- commandsstop -->` markers. Do **not** delete those markers — without them, `oclif readme` will prepend generated content and clobber the top of the file.

---

## Contributing

### Setup

```bash
bun install
bun run build         # compile once so dist/ exists for tooling
```

### Pre-Commit Hooks

This repo uses [pre-commit](https://pre-commit.com/) (config in [`.pre-commit-config.yaml`](./.pre-commit-config.yaml)). Install once:

```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

Hooks (run on every commit):

- **Core hygiene** — trailing whitespace, end-of-file, YAML/JSON/TOML validation, merge-conflict markers, case conflicts, large-file check (`>1000KB`), private-key detection.
- **Secrets** — `gitleaks`.
- **Commit message** — `cz-conventional-gitmoji` (gitmoji + conventional commit format; see `git log` for examples like `✨ feat:`, `🐛 fix:`, `📝 docs:`).
- **TypeScript (local)** — `bun run lint` and `bun run typecheck` on pre-commit; `bun run test` on pre-push.

### CI

[`.github/workflows/pre-commit.yml`](./.github/workflows/pre-commit.yml) runs the same pre-commit hooks on every PR and every push to `main`, using Bun 1.3.14 on Ubuntu. A green CI run requires lint, typecheck, and the full test suite to pass.

### Conventions

- **TDD** — write the test first. Every step handler, every CLI command, every wrapper has a test. See [`AGENTS.md`](./AGENTS.md) and the project's `AGENTS.md` at the repo root for the full contributor philosophy.
- **Surgical changes** — touch only what the task requires. Match existing style. Don't refactor unrelated code.
- **Ponytail** — prefer the stdlib, prefer native platform features, prefer fewer files. `ponytail:` comments in the source deliberately mark known simplifications and their upgrade path. Don't remove them without understanding the ceiling they document.
- **Commit messages** — `<gitmoji> <type>: <subject>` (e.g. `✨ feat: hordr run <child> skips planning for epic children (ADR-0010)`).
- **Lint is law** — `bun run lint` must pass before commit. No "pre-existing" excuses.

### Spec & Decisions

- [`SPEC.md`](./SPEC.md) is the authoritative specification.
- [`CONTEXT.md`](./CONTEXT.md) is the domain glossary (Run, Bean, Workflow, Step, Agent, Harness, Persona, Worktree, Pane, Queue, HITL Gate, Primary Branch, Supervisor Pane).
- [`docs/adr/`](./docs/adr/) holds the 10 accepted ADRs (see below). Read the relevant ADR before changing a decision it records.

---

## Troubleshooting

### `beans CLI not found on PATH`

`assertBeansOnPath()` failed. Hordr shells out to `beans` for every bean read/write.

```bash
command -v beans           # must succeed
which beans
```

If missing, install `beans` and ensure it's on `PATH`. The typed error is `BeansError`; tests can suppress it via `_setBeansPresentForTesting(false)`.

### `herdr CLI not found on PATH`

Same pattern for `herdr` (`HerdrError`). Override the binary path with `HERDR_BIN_PATH=/path/to/herdr` for testing or unusual installs.

### `ConfigError: No hordr config found`

`loadConfig()` walked up from `process.cwd()` to `/` and found no `.beans.yml` with a top-level `hordr:` block.

```bash
ls -la .beans.yml          # does it exist?
grep '^hordr:' .beans.yml  # does it have the block?
```

Run hordr from a directory inside your project (not from `/` or `~`).

### `ConfigError: Invalid hordr config: …`

The `hordr:` block failed zod validation. The error message lists each offending path (e.g. `concurrency: Expected number, received string`). Fix the YAML and re-run.

### `harness 'opencode' not on PATH`

`resolveHarness()` couldn't find the configured harness binary for a role.

```bash
command -v opencode        # (or whatever you set in agents.<role>.harness)
```

Either install the harness, or change `agents.<role>.harness` in `.beans.yml` to a binary that exists. The default config ships `opencode` for every role.

### `no herdr panes found — run \`hordr decompose\` inside a herdr session`

`decompose` (and the supervisor spawned by `run`/`drain`) need a live herdr session to split panes from. Start herdr in your project directory and re-run.

### `workspace … has no panes to split from`

The worktree's workspace exists but has no panes (unusual — `worktree create` should leave at least the root pane). Restart herdr or manually open a pane in the workspace, then `hordr advance <bean>` to retry.

### `Invalid transition: <from> -> <to>`

The Run state machine refused an illegal transition. This usually means a handler returned the wrong `runPatch.status`, or a command tried to skip a required state. Check `ALLOWED_TRANSITIONS` in [`src/engine/run.ts`](./src/engine/run.ts). If the Run is wedged, `hordr reset <bean>` (with `-f` to skip the prompt) clears state and reverts the bean to `todo`.

### `Run state corrupt for <bean-id>: …`

`getRun`/`listRuns` parsed the JSON but it failed `RunStateSchema` validation. Inspect `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`:

```bash
echo "$HERDR_PLUGIN_STATE_DIR"
cat "$HERDR_PLUGIN_STATE_DIR/<bean-id>.json" | jq .
```

If unrecoverable, delete the file (or `hordr reset <bean>`) and re-run from `plan`/`run`.

### `git … failed in <cwd>: …` during the commit step

The `commit` handler runs `git add -A && git commit` inside the worktree. Common causes: nothing to commit (the implementer didn't write anything), the worktree branch is detached, or GPG signing failed.

GPG failures are handled automatically — `commit.ts` retries with `-c commit.gpgsign=false` and writes a `warning:` to stderr. The commit is still valid; the `Refs: <bean-id>` trailer is the audit hook, not the signature.

### `gh` errors during `pr` or `close-merged`

The `pr` step uses `gh pr list --head <branch> --json url --limit 1`; `close-merged` uses `gh pr view --json state,mergedAt --branch <branch>`. Failures (auth, rate limit, network) are recorded as `failed` by `closeMerged` and re-raised by the `pr` handler. Run `gh auth status` and `gh auth refresh` if needed.

### `HERDR_PLUGIN_EVENT_JSON not set; this command must be invoked by herdr as an event hook`

`on-worktree-created` / `on-worktree-removed` read the event payload from `HERDR_PLUGIN_EVENT_JSON`, which herdr sets only when firing the hook. If you're invoking these commands manually for debugging, set the env var yourself:

```bash
HERDR_PLUGIN_EVENT_JSON='{"event":"worktree_created","data":{"type":"worktree_created","worktree":{"branch":"bean/hordr-1234","open_workspace_id":"wJ","path":"/wt/bean/hordr-1234"}}}' \
  ./bin/dev.js on-worktree-created
```

### Supervisor pane didn't spawn

The `run`/`drain` commands fire-and-forget the supervisor via a detached child (`spawn(HORDR_BIN, ['supervise', beanId], {detached: true, stdio: 'ignore'})`). Spawn errors are swallowed on purpose — the Run is still in `running` state, and `hordr advance <bean>` will drive it manually. If supervisors never appear, check that `hordr` is on `PATH` (or that `HERDR_BIN_PATH` points somewhere valid).

### `workflow "<name>" not found for bean <bean-id>`

The Run references a workflow name that isn't in the current `hordr.workflows` map. Either the config changed between `plan`/`run` and `advance`, or the workflow marker in the bean body names something that doesn't exist. Fix the config or `hordr reset <bean>` and re-plan.

---

## Architecture Decision Records

ADRs live in [`docs/adr/`](./docs/adr/). Each records a decision that shapes hordr's architecture. Read the relevant ADR before changing what it covers.

| ADR                                                          | Decision                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [0001](./docs/adr/0001-standalone-herdr-plugin.md)           | Hordr is a standalone OCLIF binary registered as a herdr plugin (not folded into herdr core or beans). |
| [0002](./docs/adr/0002-run-identity-is-bean-id.md)           | Run identity is the bean id (natural key); one Run per bean, ever.                                     |
| [0003](./docs/adr/0003-bean-status-coarse-run-state-fine.md) | Bean status stays coarse (Beans-native); fine-grained workflow state lives in the Run.                 |
| [0004](./docs/adr/0004-action-driven-no-daemon.md)           | Action-driven v1: no daemon, no scheduler. Concurrency via supervisor panes.                           |
| [0005](./docs/adr/0005-typescript-oclif.md)                  | TypeScript + OCLIF for v1 (not Rust). Port trigger: stable for one release cycle + static-binary need. |
| [0006](./docs/adr/0006-pane-identity-via-labels.md)          | Pane identity is by label (`hordr:<bean-id>:<role>`), not stored pane id.                              |
| [0007](./docs/adr/0007-no-auto-merge.md)                     | No auto-merge. PR creation is terminal; merge is human + GitHub.                                       |
| [0008](./docs/adr/0008-epic-bean-is-spec.md)                 | The epic bean body IS the spec (6 sections incl. Decisions + Decomposition).                           |
| [0009](./docs/adr/0009-decompose-is-stateless.md)            | `hordr decompose` is a stateless CLI command (no Run, no supervisor pane, runs on `develop`).          |
| [0010](./docs/adr/0010-children-skip-planning.md)            | Decomposed children skip planning; they enter the Run SM directly at `queued`.                         |

### Non-Goals (v1)

From SPEC §9. These are explicitly **out of scope** for v1 — do not implement them without raising a new ADR:

- No daemon / background scheduler. All Runs are driven by explicit CLI invocations or supervisor panes. (Phase 2.)
- No custom bean statuses. Status stays Beans-native (`todo` / `draft` / `in-progress` / `completed` / `scrapped`).
- No multi-tenant or remote operation. Hordr runs locally against a local herdr socket and local `beans`.
- No `main` branch operations. `main` is release-only.
- No auto-merge. PR creation is terminal; merge is human + GitHub; `close-merged` finalizes.
- No frontend / board UI. (Phase 2 — herdr plugin pane.)
- No deploy workflow. (Phase 2.)
- No open/extensible step kinds. The set of 8 is closed.

---

## License

[MIT](./package.json) © Fabian Schuh
