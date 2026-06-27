# Hordr

A herdr plugin that orchestrates a horde of coding agents through beans, worktrees, and workflows. Hordr sequences agents through configurable workflows with HITL (human-in-the-loop) gates and concurrency limits. It's a **generic agent orchestrator** — the engine doesn't know about commits, tests, or PRs. All domain behavior lives in agent persona text.

## Key Features

- **Two step kinds.** `agent` (spawn + wait for done/blocked) and `hitl` (block for external signal). That's the entire engine vocabulary.
- **Domain-agnostic.** The engine never parses agent output. The agent's self-reported herdr status IS the signal (ADR-0013).
- **Worktree isolation.** Each bean gets its own git worktree (optional, per-workflow config). Agents work in isolation; `develop` stays clean.
- **Concurrency limits.** Max N runs simultaneously. Overflow queues automatically.
- **HITL gates.** Block the workflow until a human approves (`hitl: approve`) or an external event fires (`hitl: external`).
- **Bean-driven.** Specs, tasks, and decomposition live in beans (markdown files under `.beans/`). The bean IS the spec (ADR-0008).
- **Herdr plugin.** Registers as a herdr plugin via `herdr-plugin.toml`. Actions appear in herdr's UI; event hooks fire on worktree lifecycle.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Commands](#commands)
- [Workflow Authoring](#workflow-authoring)
- [The End-to-End Flow](#the-end-to-end-flow)
- [Run State Machine](#run-state-machine)
- [Testing](#testing)
- [Herdr Plugin Integration](#herdr-plugin-integration)
- [Troubleshooting](#troubleshooting)
- [Architecture Decision Records](#architecture-decision-records)
- [Contributing](#contributing)
- [License](#license)

---

## Tech Stack

| Layer               | Technology                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| **Language**        | TypeScript 5.9 (ESM, strict mode)                                         |
| **CLI Framework**   | OCLIF 4 (`@oclif/core` + `@oclif/plugin-help`)                            |
| **Validation**      | Zod 3 (config schema, Run state, event payloads)                          |
| **YAML Parsing**    | `yaml` 2 (`.beans.yml` config)                                            |
| **Package Manager** | Bun (install, build, dev)                                                 |
| **Test Runner**     | Mocha 11 + Chai 4 (via `@oclif/test`)                                     |
| **Linter**          | ESLint 9 (`eslint-config-oclif`)                                          |
| **Formatter**       | Prettier (`@oclif/prettier-config`)                                       |
| **Pre-commit**      | pre-commit framework (trailing whitespace, EOF, secrets, lint, typecheck) |

---

## Prerequisites

Before installing hordr, you need:

- **[herdr](https://herdr.dev) 0.7.0+** — terminal workspace manager. Hordr is a herdr plugin; it drives panes, worktrees, and waits through herdr's socket API.
- **[beans](https://github.com/your-org/beans)** — the issue tracker. Hordr reads/writes bean status and bodies via the `beans` CLI. Must be on PATH.
- **Bun 1.3+** (recommended) or Node.js 18+ — for running hordr itself.
- **A harness binary** — the agent CLI that hordr spawns (e.g., `opencode`, `claude`, `codex`). Configured per agent role in `.beans.yml`.
- **`gh` CLI** — GitHub CLI, used by `hordr close-merged` to detect merged PRs.
- **git** — for worktree management.

> [!IMPORTANT]
> Hordr is designed to run **inside a herdr session**. Commands like `hordr decompose` and `hordr run` spawn panes via herdr's socket API. Run them from a herdr-managed terminal.

---

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/herdr/hordr.git
cd hordr
bun install
```

### 2. Build

```bash
bun run build
```

This runs `tsc -b` and outputs to `dist/`. The CLI is executable via `./bin/dev.js` (development, uses ts-node) or `./bin/run.js` (production, uses compiled `dist/`).

### 3. Verify

```bash
./bin/dev.js --version
# hordr/0.1.0 linux-x64 node-v26.2.0

./bin/dev.js --help
# Lists all commands
```

### 4. Link as a Herdr Plugin

```bash
herdr plugin link .
```

This registers hordr's actions and event hooks from `herdr-plugin.toml`. Verify:

```bash
herdr plugin list --plugin herdr.hordr
herdr plugin action list --plugin herdr.hordr
```

### 5. Configure

Hordr reads its configuration from `.beans.yml` in your project root. See [Configuration](#configuration) below.

### 6. Run Your First Bean

```bash
# Create a task bean (via beans CLI)
beans create "Add config validation" -t task -d "$(cat <<'EOF'
## Requirement
We need config validation.

## Spec
Add zod validation to the config loader.

## Acceptance Criteria
- [ ] Invalid config exits non-zero
- [ ] Valid config returns typed object

## Test Plan
Unit test with valid/invalid fixtures.
EOF
)"

# Run it through the workflow
hordr run hordr-XXXX
```

---

## Architecture

### Directory Structure

```
hordr/
├── bin/
│   ├── run.js              # Production entry (uses dist/)
│   └── dev.js              # Dev entry (uses ts-node/esm)
├── src/
│   ├── commands/           # OCLIF command classes (thin: arg→engine→output)
│   │   ├── run.ts          # Universal entry: creates Run + enqueues
│   │   ├── decompose.ts    # Stateless: epic → child task beans
│   │   ├── advance.ts      # Execute one step (idempotent)
│   │   ├── supervise.ts    # Blocking loop (runs in supervisor pane)
│   │   ├── status.ts       # Table of all runs + queue depth
│   │   ├── drain.ts        # Start queued runs up to concurrency
│   │   ├── close-merged.ts # Finalize beans whose PRs merged
│   │   ├── reset.ts        # Delete run + worktree + branch
│   │   ├── take.ts         # Focus blocked pane (herdr pane zoom)
│   │   ├── on-worktree-created.ts  # Event hook
│   │   └── on-worktree-removed.ts  # Event hook
│   ├── engine/             # Workflow engine (domain-agnostic)
│   │   ├── types.ts        # EngineDeps interface, StepResult
│   │   ├── advance.ts      # Single-step executor
│   │   ├── supervise.ts    # Blocking advance loop
│   │   ├── run.ts          # State transition table + transition()
│   │   ├── queue.ts        # Enqueue / drain / concurrency
│   │   ├── close-merged.ts # gh pr scan + finalize
│   │   └── steps/          # The two step kinds
│   │       ├── agent.ts    # Generic: spawn + wait done/blocked
│   │       ├── hitl.ts     # Block for external signal
│   │       ├── shared.ts   # launchOrReuse helper, StepError
│   │       └── index.ts    # dispatchStep() + StepConfig type
│   ├── harness/            # Agent persona injection
│   │   └── launcher.ts     # resolveHarness, buildOpeningPrompt, launchAgent
│   ├── herdr/              # Herdr CLI wrappers
│   │   ├── pane.ts         # splitPane, findPane, runInPane, sendText
│   │   ├── wait.ts         # waitAgentStatus (blocks)
│   │   └── worktree.ts     # createWorktree, removeWorktree, branchFor
│   ├── beans/              # Beans CLI wrappers
│   │   ├── client.ts       # getBean, getStatus, setStatus, getBody, setWorkflow
│   │   └── validate-spec.ts # Type-aware body validator (epic 6, task 4)
│   ├── config/             # .beans.yml parsing
│   │   ├── schema.ts       # Zod schema (HordrConfig)
│   │   └── loader.ts       # Upward search + YAML parse + validate
│   ├── state/              # Run state persistence
│   │   ├── schema.ts       # RunStateSchema (zod)
│   │   └── run-store.ts    # Atomic JSON file I/O
│   ├── events/             # Herdr event payload parsing
│   │   └── payload.ts      # readWorktreeEvent, beanIdFromBranch
│   └── runtime.ts          # EngineDeps composition (wires real implementations)
├── test/                   # Mocha + Chai tests (mirrors src/ structure)
├── docs/
│   └── adr/                # 13 Architecture Decision Records
├── .beans/                 # Hordr's own backlog (dogfooded)
├── .beans.yml              # Beans + hordr config
├── herdr-plugin.toml       # Herdr plugin manifest
├── CONTEXT.md              # Domain glossary
├── SPEC.md                 # Full specification (Draft v3)
└── README.md               # This file
```

### Layered Design

```
┌─────────────────────────────────────────────────────┐
│                    CLI Commands                      │
│         (src/commands/ — thin: arg→engine→output)    │
├─────────────────────────────────────────────────────┤
│                   Workflow Engine                     │
│    (src/engine/ — Run SM, advance, queue, steps)     │
│         Domain-agnostic — 2 step kinds only          │
├──────────────────┬──────────────────────────────────┤
│    EngineDeps     │      (the seam — ADR-0011)       │
│    interface      │   Engine never imports below     │
├──────────────────┼──────────┬───────────┬───────────┤
│   Harness Layer  │  Herdr   │   Beans   │   State   │
│  (persona inject)│ (panes,  │ (status,  │ (Run JSON │
│                  │ worktrees)│  bodies)  │  files)   │
└──────────────────┴──────────┴───────────┴───────────┘
```

The `EngineDeps` interface (`src/engine/types.ts`) is the key architectural seam. The engine defines what it needs (spawn agents, wait for status, manage worktrees) without knowing how those operations are implemented. `src/runtime.ts` wires the real implementations; tests inject mocks.

### Request Lifecycle (Single Step)

```
hordr advance <bean>
    │
    ▼
advance(beanId, deps)
    │
    ├─ getRun(beanId)          ← read Run state JSON
    ├─ loadConfig()            ← parse .beans.yml
    ├─ workflow.steps[run.step]← current step
    │
    ├─ dispatchStep(run, step, deps)
    │   ├─ step.agent?  → agent handler
    │   │   ├─ launchOrReuse(run, role, deps)
    │   │   │   └─ deps.launchAgent({beanId, cwd, role, workspaceId})
    │   │   ├─ deps.waitForAgentDone(paneId, 0)
    │   │   │   └─ polls herdr wait agent-status (done or blocked)
    │   │   └─ return {done: true} or {done: false, block: true}
    │   │
    │   └─ step.hitl?  → hitl handler
    │       └─ return {done: false, block: true}
    │
    ├─ apply runPatch + bump step index
    └─ putRun(nextRun)         ← atomic write Run state JSON
```

### Key Design Decisions

- **ADR-0011:** The engine is domain-agnostic. Two step kinds. All coding-specific behavior (commits, tests, PRs) lives in agent persona text — not engine handlers.
- **ADR-0012:** Worktree lifecycle is workflow-level config (`worktree: true/false`), not step-driven. The engine creates the worktree when the Run starts and removes it when the Run terminates.
- **ADR-0013:** Agent self-reported herdr status IS the signal. `done` → advance. `blocked` → run blocks. The engine never parses agent output.

---

## Configuration

Hordr reads from `.beans.yml` in your project root. The file has two blocks: `beans:` (the beans CLI config) and `hordr:` (the hordr config).

### Full Reference

```yaml
beans:
  path: .beans # where bean markdown files live
  prefix: hordr- # bean ID prefix
  id_length: 4 # bean ID length (after prefix)

hordr:
  concurrency: 3 # max simultaneous running + blocked Runs
  primary_branch: develop # worktree base + PR target branch
  worktree_branch_prefix: bean/ # → bean/<bean-id>

  agents: # role → harness + persona
    implementer:
      harness: opencode # binary on PATH
      persona: | # opening prompt (ALL domain behavior lives here)
        You are the implementer. Read the bean spec, implement the change,
        commit with trailer Refs: <bean-id>.

    tester:
      harness: opencode
      persona: |
        You are the tester. Run the test plan.
        Signal blocked if tests fail, done if they pass.

    reviewer:
      harness: opencode
      persona: |
        You are the reviewer. Review the diff for correctness and style.

    planner: # used by hordr decompose
      harness: opencode
      persona: |
        You decompose an epic into independently implementable task beans.
        Read the epic bean body: beans show <epic-id>
        Read every ADR in ## Decisions: docs/adr/NNNN-*.md
        Create task beans: beans create "<title>" -t task --parent <epic-id>
        Fill each child's body (Requirement, Spec, AC, Test Plan).
        List children in the epic's ## Decomposition section.

  workflows: # workflow name → step sequence
    implement:
      worktree: true # ADR-0012: create worktree when Run starts
      steps:
        - agent: implementer # spawn implementer, wait for done/blocked
        - agent: tester # spawn tester, wait for done/blocked
        - agent: reviewer # spawn reviewer, wait for done/blocked
        - hitl: external # block until hordr close-merged

  routing:
    default_workflow: implement # workflow assigned to new Runs
    plan_workflow: plan # (reserved for future use)
```

### Configuration Fields

| Field                       | Type                    | Default   | Description                                             |
| --------------------------- | ----------------------- | --------- | ------------------------------------------------------- |
| `concurrency`               | `number` (positive int) | `3`       | Max simultaneous active Runs (running + blocked)        |
| `primary_branch`            | `string`                | `develop` | Base branch for worktrees and PR targets                |
| `worktree_branch_prefix`    | `string`                | `bean/`   | Prefix for worktree branch names → `bean/<bean-id>`     |
| `agents.<role>.harness`     | `string`                | —         | Binary name on PATH (e.g., `opencode`, `claude`)        |
| `agents.<role>.persona`     | `string`                | —         | Opening prompt text injected into the harness           |
| `workflows.<name>.worktree` | `boolean`               | `false`   | Whether the engine creates a worktree for this workflow |
| `workflows.<name>.steps[]`  | `AgentStep \| HitlStep` | —         | Ordered list of workflow steps                          |
| `routing.default_workflow`  | `string`                | —         | Workflow name assigned to new Runs                      |

### Step Types

| Step  | YAML Syntax        | Description                                              |
| ----- | ------------------ | -------------------------------------------------------- |
| Agent | `- agent: <role>`  | Spawns the role's harness, waits for `done` or `blocked` |
| HITL  | `- hitl: approve`  | Blocks until external approval (transition out via CLI)  |
| HITL  | `- hitl: external` | Blocks until external event (e.g., `hordr close-merged`) |

---

## Commands

### User-Facing Commands

| Command                  | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `hordr run <bean>`       | Start a bean through its workflow. Creates Run + worktree (if configured), validates body, enqueues. |
| `hordr decompose <epic>` | Decompose an epic into child task beans. Stateless — spawns planner on develop, no worktree.         |
| `hordr status`           | Show all runs with state, step, pane refs, and queue depth. `--json` for machine output.             |
| `hordr drain`            | Start queued runs until the concurrency limit is reached.                                            |
| `hordr close-merged`     | Scan `pr-open` runs; for each merged PR: finalize bean, remove worktree.                             |
| `hordr reset <bean>`     | Delete run state + worktree + branch. Bean reverts to `todo`. `-f` to skip confirmation.             |
| `hordr take <bean>`      | Focus the blocked pane in herdr for interactive recovery.                                            |

### Internal Commands

| Command                     | Description                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `hordr advance <bean>`      | Execute exactly one step. Idempotent — safe to call repeatedly. `--all` advances every non-terminal run.              |
| `hordr supervise <bean>`    | Blocking loop: `advance` + sleep until terminal or blocked. Runs inside the supervisor pane spawned by `run`/`drain`. |
| `hordr on-worktree-created` | Event hook: fired by herdr on `worktree.created`. Updates Run state with new workspace.                               |
| `hordr on-worktree-removed` | Event hook: fired by herdr on `worktree.removed`. Marks Run's worktree as removed (tombstone).                        |

### Flags

| Flag              | Commands                                                    | Description                                               |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `--json`          | run, decompose, status, drain, close-merged, reset, advance | Emit machine-parseable JSON output                        |
| `--force`         | decompose, reset                                            | Override safety checks (re-decompose / skip confirmation) |
| `--all`           | advance                                                     | Advance every non-terminal run                            |
| `--timeoutMs <n>` | decompose                                                   | Max wait for planner agent (default: 600000 = 10 min)     |
| `--pollMs <n>`    | supervise                                                   | Poll interval between advances (default: 1000)            |

---

## Workflow Authoring

### Defining a Workflow

Workflows live in `.beans.yml` under `hordr.workflows.<name>`. Each workflow is a sequence of `agent` and `hitl` steps.

**Coding workflow (with worktree):**

```yaml
workflows:
  implement:
    worktree: true
    steps:
      - agent: implementer
      - agent: tester
      - agent: reviewer
      - hitl: external
```

**Research workflow (no worktree):**

```yaml
workflows:
  research:
    steps:
      - agent: researcher
      - hitl: approve
```

**Multi-phase coding workflow:**

```yaml
workflows:
  full-cycle:
    worktree: true
    steps:
      - agent: implementer
      - agent: tester
      - hitl: approve # human reviews test results
      - agent: deployer
      - hitl: external # block until deployment verified
```

### Writing Agent Personas

The persona is the opening prompt injected into the harness. **All domain-specific behavior lives here** — the engine doesn't know about commits, tests, PRs, or any other workflow details.

**Good persona (specific, actionable):**

```yaml
agents:
  implementer:
    harness: opencode
    persona: |
      You implement a single task bean.
      Read the spec: beans show <bean-id>
      If this bean has a parent epic, read it for full context: beans show <parent-id>
      Read ADRs cited in the parent or in this bean's Spec section.
      Implement only this task's scope. Do not re-decide architecture.
      When done, commit with trailer: git commit --trailer="Refs: <bean-id>"
      Open a PR: gh pr create --base develop
      Signal done when the PR is open.
      If you get stuck (tests fail, unclear requirements), signal blocked.
```

**Bad persona (too vague):**

```yaml
agents:
  implementer:
    harness: opencode
    persona: 'Do the work.'
```

> [!TIP]
> The persona is the ONLY place where domain knowledge lives. If you want the agent to commit with a specific trailer format, say so in the persona. If you want it to run tests before signaling done, say so. The engine doesn't enforce any of this — it just spawns, waits, and advances.

---

## The End-to-End Flow

```
DISCOVERY (outside hordr)          DECOMPOSE (hordr)              IMPLEMENT (hordr)

 human + LLM discuss               hordr decompose <epic>          hordr run <child>
 → write ADRs to docs/adr/         → planner reads epic + ADRs     → worktree: bean/<child>
 → create epic bean                → creates child task beans      → agent: implementer
 → commit on develop               → fills Decomposition section   → agent: tester
                                   → epic → completed              → agent: reviewer
                                                                  → hitl: external
                                                                         │
                                                                ┌────────┘
                                                                ▼
                                                          FINALIZE (human + hordr)

                                                          human reviews PRs on GitHub
                                                          human merges on GitHub
                                                          hordr close-merged
                                                          → child → completed
                                                          → worktree removed
```

### Key Principle

Discovery and decomposition happen on `develop`. Only implementation spins off worktrees. This means ADRs and specs are on develop before any agent touches code — downstream worktrees (branched from develop) inherit them for free.

---

## Run State Machine

A Run is identified by its bean id (natural key). State persists to `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`.

```
Entry via hordr run <bean>:
  (none) → queued → running → ...
                           │
                     agent steps advance
                     or block
                           │
                    ┌──────┴──────┐
                    ▼              ▼
                 blocked       pr-open
                    │              │
            hordr take        hordr close-merged
            hordr reset             │
                    │              ▼
                    ▼            closed
              running (resume)
              (none) (reset)
```

| Run State | Bean Status | Description                                         |
| --------- | ----------- | --------------------------------------------------- |
| _(none)_  | todo        | No Run exists. Ready for `hordr run`.               |
| `queued`  | todo        | Run created, waiting for concurrency slot.          |
| `running` | in-progress | Workflow executing. Supervisor pane active.         |
| `blocked` | in-progress | Agent signaled blocked. Needs human (`hordr take`). |
| `pr-open` | in-progress | HITL external gate. Waiting for PR merge.           |
| `closed`  | completed   | Terminal. Worktree removed.                         |

---

## Testing

### Running Tests

```bash
# Run the full test suite
bun run test

# Run a specific test file
npx mocha test/engine/advance.test.ts

# Run tests matching a pattern
npx mocha --grep "advance" test/**/*.test.ts
```

The test suite uses Mocha + Chai, configured via `.mocharc.json`. Tests run through `ts-node/esm` (no build step needed).

### Test Structure

Tests mirror the source tree:

```
test/
├── commands/         # Command tests (use @oclif/test captureOutput)
├── engine/           # Engine tests (mock EngineDeps)
│   └── steps/        # Step handler tests
├── harness/          # Launcher tests (mock herdr/pane shell seam)
├── herdr/            # Herdr CLI wrapper tests (mock _shell seam)
├── beans/            # Beans client + validate-spec tests
├── config/           # Config schema tests
├── state/            # Run store tests (temp dirs, atomic writes)
└── engine/helpers.ts # Shared test utilities (makeRun, makeDeps)
```

### Writing Tests

Tests use module-level test seams (`_setShellForTesting`, `_setDepsForTesting`) for mocking. Example:

```typescript
import {expect} from 'chai'
import {_setShellForTesting, _resetShell} from '../../src/herdr/pane.js'

describe('my module', () => {
  beforeEach(() => {
    _setShellForTesting((args) => {
      // Return canned responses based on args
      if (args[1] === 'split') return JSON.stringify({result: {pane: {pane_id: 'wX:p1'}}})
      return ''
    })
  })

  afterEach(() => _resetShell())

  it('does the thing', () => {
    // Test logic here
  })
})
```

### Available Scripts

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `bun run build`     | Compile TypeScript to `dist/`                  |
| `bun run test`      | Run Mocha test suite                           |
| `bun run lint`      | Run ESLint                                     |
| `bun run typecheck` | Run `tsc --noEmit` (type-check without output) |

---

## Herdr Plugin Integration

### Plugin Manifest

Hordr registers with herdr via `herdr-plugin.toml`:

```toml
id = "herdr.hordr"
name = "Hordr"
version = "0.2.0"
min_herdr_version = "0.7.0"
```

### Actions (7)

Actions appear in herdr's UI and delegate to `hordr` subcommands:

| Action ID      | Command              | Description                        |
| -------------- | -------------------- | ---------------------------------- |
| `run`          | `hordr run`          | Run a bean through its workflow    |
| `decompose`    | `hordr decompose`    | Decompose an epic into child tasks |
| `status`       | `hordr status`       | Show horde status                  |
| `drain`        | `hordr drain`        | Start queued beans                 |
| `close-merged` | `hordr close-merged` | Close merged PRs                   |
| `reset`        | `hordr reset`        | Reset a bean's run                 |
| `take`         | `hordr take`         | Take over a blocked bean           |

### Event Hooks (2)

Herdr fires event hooks on worktree lifecycle. Hordr uses these to keep Run state synchronized:

| Event              | Command                     | What it does                                                                    |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `worktree.created` | `hordr on-worktree-created` | Updates Run's worktree ref with new workspace_id + path                         |
| `worktree.removed` | `hordr on-worktree-removed` | Sets worktree tombstone (`removed: true`) — preserves branch for `close-merged` |

Event payloads arrive as `HERDR_PLUGIN_EVENT_JSON` env var (JSON envelope with workspace_id, branch, path).

### Linking and Verifying

```bash
# Link the plugin (run from the hordr repo root)
herdr plugin link .

# Verify registration
herdr plugin list --plugin herdr.hordr

# List actions
herdr plugin action list --plugin herdr.hordr

# Check event hook logs
herdr plugin log list --plugin herdr.hordr
```

---

## Troubleshooting

### `hordr run` fails with "body invalid"

The bean body doesn't pass the type-aware validator. Check:

```bash
# See what's missing (inline — no separate command)
beans show <bean-id> --body-only
```

Ensure the body has the required sections:

- **Task/bug:** `## Requirement`, `## Spec`, `## Acceptance Criteria` (with `- [ ]` checkbox), `## Test Plan`
- **Epic:** All 4 above + `## Decisions` + `## Decomposition` (bodies may be empty; headers must exist)

### `hordr run` fails with "run is in status 'queued'"

A Run already exists but isn't in `queued` state. Either:

- `hordr advance <bean>` to move it forward
- `hordr reset <bean>` to delete the Run and start fresh

### Agent pane not spawning

Check that herdr is running and you're inside a herdr session:

```bash
herdr status
herdr pane list --json
```

Hordr needs at least one pane in the workspace to split from.

### `hordr close-merged` finds nothing

Ensure:

1. `gh` CLI is on PATH and authenticated: `gh auth status`
2. The Run is in `pr-open` state: `hordr status`
3. The PR actually exists on GitHub: `gh pr view --branch bean/<bean-id>`

### Worktree not removed after reset

```bash
# Check for orphaned workspaces
herdr workspace list

# Manually remove if needed
herdr worktree remove --workspace <workspace-id> --force
```

### GPG signing failures during commit

The commit handler (if used in agent personas) tries GPG signing first, then falls back to unsigned with a warning. If your agent persona handles commits, ensure the persona says "commit with `--no-gpg-sign` if signing fails" or let the engine's fallback handle it.

### `HERDR_PLUGIN_STATE_DIR` not set

If running event hooks manually (outside herdr), set the state dir:

```bash
HERDR_PLUGIN_STATE_DIR=/tmp/hordr-state hordr on-worktree-created
```

Inside herdr, this env var is set automatically.

---

## Architecture Decision Records

| ADR                                                        | Title                                                | Status   |
| ---------------------------------------------------------- | ---------------------------------------------------- | -------- |
| [0001](docs/adr/0001-standalone-herdr-plugin.md)           | Standalone OCLIF binary as herdr plugin              | Accepted |
| [0002](docs/adr/0002-run-identity-is-bean-id.md)           | Run identity is the bean id (natural key)            | Accepted |
| [0003](docs/adr/0003-bean-status-coarse-run-state-fine.md) | Bean status stays coarse; fine-grained state in Run  | Accepted |
| [0004](docs/adr/0004-action-driven-no-daemon.md)           | Action-driven v1: no daemon, no scheduler            | Accepted |
| [0005](docs/adr/0005-typescript-oclif.md)                  | TypeScript + OCLIF for v1                            | Accepted |
| [0006](docs/adr/0006-pane-identity-via-labels.md)          | Pane identity is by label                            | Accepted |
| [0007](docs/adr/0007-no-auto-merge.md)                     | No auto-merge: PR creation is terminal               | Accepted |
| [0008](docs/adr/0008-epic-bean-is-spec.md)                 | Epic bean body IS the spec                           | Accepted |
| [0009](docs/adr/0009-decompose-is-stateless.md)            | `hordr decompose` is stateless (not a Run)           | Accepted |
| [0010](docs/adr/0010-children-skip-planning.md)            | Decomposed children skip planning, enter at `queued` | Accepted |
| [0011](docs/adr/0011-generic-agent-orchestration.md)       | Hordr is a generic agent orchestrator                | Accepted |
| [0012](docs/adr/0012-worktree-is-workflow-config.md)       | Worktree lifecycle is workflow-level config          | Accepted |
| [0013](docs/adr/0013-agent-status-is-signal.md)            | Agent self-reported status replaces output parsing   | Accepted |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes. Ensure `bun run build && bun run test && bun run lint` all pass.
4. Write tests for new functionality.
5. If adding a new command, register it in `herdr-plugin.toml`.
6. If making an architectural decision, write an ADR in `docs/adr/`.
7. Commit with a conventional-commit + gitmoji message (enforced by pre-commit).
8. Open a PR.

### Pre-commit Hooks

The repo uses [pre-commit](https://pre-commit.com/) with:

- Trailing whitespace + EOF fixing
- YAML/JSON/TOML validation
- Secret detection (gitleaks)
- ESLint (on staged files)
- TypeScript type-check (on staged files)
- Conventional-commit + gitmoji commit messages

Install hooks after cloning:

```bash
pre-commit install
pre-commit install --hook commit-msg
```

---

## License

MIT © Fabian Schuh
