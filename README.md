# Hordr

A herdr plugin that gives coding agents isolated git worktrees and panes, with
beans as their briefs. Two modes: **single-bean** (one agent, one task,
fire-and-forget) and **fleet** (a team of agents working a milestone in
parallel, each epic in its own worktree, coordinated by a daemon broker).

```
                         ┌─────────┐
                         │  Beans  │  (work contracts: milestone → epic → task)
                         └────┬────┘
                              │
                    ┌─────────┴──────────┐
                    │       Hordr        │
                    │  run / finish /    │
                    │  fleet / daemon    │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         ┌────┴────┐    ┌─────┴─────┐   ┌─────┴──────┐
         │  Herdr  │    │  Harness  │   │  Daemon    │
         │ (panes, │    │ (opencode,│   │ (broker:   │
         │  wtrees)│    │  claude…) │   │  dispatch, │
         └─────────┘    └───────────┘   │  rollup,   │
                                         │  merge)    │
                                         └────────────┘
```

---

## Table of Contents

- [Quick start](#quick-start)
- [Use cases](#use-cases)
  - [1. One-off task (single bean)](#1-one-off-task-single-bean)
  - [2. Fleet: team on a milestone](#2-fleet-team-on-a-milestone)
  - [3. Fleet with cross-epic dependencies](#3-fleet-with-cross-epic-dependencies)
  - [4. Mixed-backend team](#4-mixed-backend-team)
- [Configuration](#configuration)
- [Commands](#commands)
- [Architecture](#architecture)
- [The fleet model](#the-fleet-model)
- [Testing](#testing)
- [ADRs](#architecture-decision-records)
- [License](#license)

---

## Quick start

```bash
git clone https://github.com/herdr/hordr.git
cd hordr
bun install
bun run build
herdr plugin link .
```

Hordr works out of the box — a `.beans.yml` with just a `beans:` block is
enough. No `hordr:` section required; defaults cover `implementer`, `tester`,
and `reviewer` roles with opencode.

```bash
# Create a task
beans create "Add input validation" -t task -d "Validate all inputs at trust boundaries."

# Hand it to an agent
hordr run hordr-XXXX
# → started hordr-XXXX in bean/hordr-XXXX (role: implementer, pane: wX:pNEW)
```

The agent works in an isolated worktree. When done, it commits and the work is
ready for review.

---

## Use cases

### 1. One-off task (single bean)

The simplest mode: one bean, one worktree, one agent. Fire-and-forget.

```bash
# Create the task
beans create "Fix null-pointer in config loader" -t bug -d "$(cat <<'EOF'
## Requirement

The config loader crashes on missing `hordr:` block.

## Acceptance Criteria

- [ ] Missing `hordr:` block uses defaults instead of crashing
EOF
)"

# Spawn an agent in an isolated worktree
hordr run hordr-XXXX

# Agent commits to bean/hordr-XXXX. Verify and merge:
hordr finish hordr-XXXX
# → merged bean/hordr-XXXX into develop, removed worktree
```

**When to use:** single tasks, bug fixes, quick experiments. No team
coordination needed.

### 2. Fleet: team on a milestone

A fleet convenes a team (from an Agent Companies package or defaults) to work a
milestone in parallel. Each epic gets its own worktree; tasks within an epic are
serialized; epics run in parallel.

**Step 1: Plan the milestone** (external to hordr — a planning session with a
human, producing a bean tree):

```bash
# Milestone
beans create "User authentication" -t milestone -d "Full auth: login, logout, sessions."

# Epics under the milestone (each gets its own parallel worktree)
beans create "Login flow" -t epic --parent hordr-MS
beans create "Session management" -t epic --parent hordr-MS

# Tasks under each epic — assigned to roles via `assigned:` frontmatter
beans create "Implement login form" -t task --parent hordr-EPIC1 \
  -d "$(cat <<'EOF'
---
assigned: implementer
---
## Requirement
Build the login form component.
EOF
)"

beans create "Test login flow" -t task --parent hordr-EPIC1 \
  --blocked-by hordr-TASK1 \
  -d "$(cat <<'EOF'
---
assigned: tester
---
## Requirement
Write integration tests for login.
EOF
)"

beans create "Implement session store" -t task --parent hordr-EPIC2 \
  -d "$(cat <<'EOF'
---
assigned: implementer
---
## Requirement
Build the session storage layer.
EOF
)"
```

**Step 2: Start the fleet** (coming soon — commands in development):

```bash
hordr fleet create hordr-MS
# → created ms/hordr-MS from develop
# → lane 1: epic hordr-EPIC1 (login flow) — worktree, dispatch loop
# → lane 2: epic hordr-EPIC2 (session mgmt) — worktree, dispatch loop
# → daemon running, 2 parallel lanes
```

**Step 3: Observe:**

```bash
hordr fleet status hordr-MS
# ┌─────────────────────────────────────────────────┐
# │ Fleet: hordr-MS (User authentication) [active]  │
# ├─────────────────────────────────────────────────┤
# │ Lane 1: hordr-EPIC1 (Login flow) [active]       │
# │   Current: hordr-TASK1 (implement login form)   │
# │   Role: implementer · Pane: w1:p1               │
# │ Lane 2: hordr-EPIC2 (Session management) [active]│
# │   Current: hordr-TASK3 (implement session store)│
# │   Role: implementer · Pane: w2:p1               │
# └─────────────────────────────────────────────────┘
```

**Step 4: Finish** (when all epics are merged into the milestone branch):

```bash
hordr fleet finish hordr-MS
# → merged ms/hordr-MS into develop (--no-ff)
# → all worktrees removed, fleet torn down
```

**What happens inside each lane:**

```
1. Daemon picks the next ready task (beans list --ready, scoped to the epic)
2. Reads assigned: from the bean → resolves role/persona/harness
3. Spawns agent invocation: "<harness> run --interactive '<persona + bean body>'"
4. Agent works, commits (one task = one commit), calls hordr done <bean-id>
5. Daemon verifies completion, rolls up status (fixup + autosquash into the commit)
6. Picks the next task (respecting --blocked-by chains)
7. When the epic completes: merges epic branch into ms/<milestone-id>
```

### 3. Fleet with cross-epic dependencies

Epics can block each other. A blocked epic gets no worktree until its blocker
merges — then its worktree is created from the milestone branch, which now
contains the blocking epic's code. Lazy creation = automatic dependency
resolution.

```bash
# Epic 2 depends on Epic 1
beans create "User profile page" -t epic --parent hordr-MS --blocked-by hordr-EPIC1
beans create "Build profile UI" -t task --parent hordr-EPIC3 \
  -d "$(cat <<'EOF'
---
assigned: implementer
---
Uses the auth module from the login flow epic.
EOF
)"
```

```
fleet create → ms/MS branch from develop
  epic-1 unblocked → worktree from ms/MS → work → merge into ms/MS
  epic-3 blocked-by epic-1 → no worktree yet
  epic-1 merges → epic-3 unblocked → worktree from ms/MS (has epic-1's code!)
```

If a merge produces a conflict (parallel epics touch the same file), the lane
enters `conflict` status. `fleet status` shows it. The human resolves manually;
the daemon detects the resolution on the next tick.

### 4. Mixed-backend team

Different roles can use different harness binaries. The `harness:` field in the
agent config (or Agent Companies AGENTS.md frontmatter) controls which binary
each role spawns.

```yaml
hordr:
  agents:
    implementer:
      harness: opencode # opencode.ai
      persona: |
        You implement ONE task bean ...
    tester:
      harness: claude # Claude Code
      persona: |
        You test ONE task bean ...
    reviewer:
      harness: codex # OpenAI Codex CLI
      persona: |
        You review ONE task bean ...
```

Each invocation spawns the role's harness — no fleet-level configuration needed.
The daemon is harness-agnostic.

---

## Configuration

`.beans.yml` carries two blocks: `beans:` (the beans CLI config) and `hordr:`
(hordr's config). The `hordr:` block is **optional** — defaults cover everything.

### Zero config (defaults)

```yaml
beans:
  path: .beans
  prefix: hordr-
  id_length: 4
# No hordr: block needed
```

| Default                  | Value      | Description                                   |
| ------------------------ | ---------- | --------------------------------------------- |
| `primary_branch`         | `develop`  | Base ref for worktrees and merges             |
| `worktree_branch_prefix` | `bean/`    | Branch prefix for single-bean worktrees       |
| `agents.implementer`     | `opencode` | Fleet-shaped persona (one task, commit, done) |
| `agents.tester`          | `opencode` | Fleet-shaped persona                          |
| `agents.reviewer`        | `opencode` | Fleet-shaped persona                          |

Default personas are minimal fleet instructions: read one assigned bean, do the
work, commit, `hordr done <id>`, stop. See [docs/fleet-guide.md](docs/fleet-guide.md)
for fuller alternatives.

### Minimal override

```yaml
beans:
  path: .beans
  prefix: hordr-

hordr:
  primary_branch: main
  agents:
    implementer:
      harness: opencode
      persona: |
        You implement ONE task bean assigned to you.
        Read it: beans show <assigned-bean-id>
        Do ONLY that task's work.
        When done: beans update <id> -s completed, commit, then hordr done <id>.
        Then stop.
```

`tester` and `reviewer` are still available from defaults.

### Full config with Agent Companies

```yaml
beans:
  path: .beans
  prefix: hordr-

hordr:
  primary_branch: develop
  company:
    path: /path/to/my-company # agents/<role>/AGENTS.md drives personas
  agents:
    implementer: # fallback if company has no AGENTS.md
      harness: opencode
      persona: |
        Custom fallback persona …
```

### Field reference

| Field                    | Type    | Default         | Description                                                        |
| ------------------------ | ------- | --------------- | ------------------------------------------------------------------ |
| `primary_branch`         | string  | `develop`       | Base ref for worktrees and fleet integration branches              |
| `worktree_branch_prefix` | string  | `bean/`         | Branch prefix for single-bean worktrees                            |
| `company.path`           | string? | —               | Agent Companies package root (or set `HORDR_COMPANY_PATH` env var) |
| `agents.<role>.harness`  | string  | `opencode`      | Harness binary on PATH                                             |
| `agents.<role>.persona`  | string  | (fleet default) | Opening prompt for the role                                        |

### The `assigned:` bean frontmatter convention

Every dispatchable bean (type `task` or `bug`) carries an `assigned:` field in
its YAML frontmatter — the role slug of the agent that should work it:

```yaml
---
title: Implement the frobnicator
type: task
status: todo
priority: high
assigned: implementer
---
```

The planner writes `assigned:` during the planning session. The daemon reads it
at dispatch time to resolve the persona + harness. Missing `assigned:` defaults
to `implementer`. See [docs/fleet-guide.md](docs/fleet-guide.md) for details.

---

## Commands

### Single-bean mode (available now)

| Command                | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `hordr run <bean>`     | Create a worktree, spawn the agent harness in a fresh pane. Fire-and-forget. |
| `hordr finish <bean>`  | Verify the bean is `completed`, merge its branch, remove the worktree.       |
| `hordr cleanup <bean>` | Remove the worktree for a bean. `--force` for unmerged changes.              |
| `hordr daemon`         | Run the daemon broker (unix socket). Auto-started by fleet commands.         |

#### `hordr run`

```bash
hordr run <bean> [--role <name>] [--base <ref>] [--json]
```

| Flag            | Default       | Description                                          |
| --------------- | ------------- | ---------------------------------------------------- |
| `--role <name>` | `implementer` | Agent role (must exist in config)                    |
| `--base <ref>`  | `develop`     | Git base ref for the worktree                        |
| `--json`        | off           | Emit `{bean, branch, pane, role, workspace}` as JSON |

#### `hordr finish`

```bash
hordr finish <bean> [--json]
```

Verifies the bean is `completed` (reading from the worktree, not the main
repo — the worktree has the up-to-date status), merges `bean/<id>` into
`primary_branch` via `--no-ff`, removes the worktree.

#### `hordr cleanup`

```bash
hordr cleanup <bean> [--force] [--json]
```

### Fleet mode (in development)

| Command                          | Description                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `hordr fleet create <milestone>` | Create the milestone integration branch, scan for unblocked epics, start lanes. |
| `hordr fleet status <milestone>` | Show fleet state + all lanes (active/pending/merging/conflict/done).            |
| `hordr fleet finish <milestone>` | Assert all epics merged, merge `ms/<id>` into primary, teardown.                |
| `hordr fleet abort <milestone>`  | Stop all lanes. `--force` removes all worktrees + milestone branch.             |

---

## Architecture

```
src/
├── commands/          # OCLIF command classes (run, finish, cleanup, daemon, fleet/*)
├── beans/             # beans CLI client (read-only: getBean, getBody)
├── config/            # schema (Zod), loader, defaults
├── company/           # Agent Companies manifest parsing
├── daemon/            # unix-socket server (extensible route registry)
├── dispatch/          # the fleet dispatch core:
│   ├── dispatch.ts    #   getDispatchable (subtree ∩ --ready, priority sort)
│   ├── role.ts        #   resolveRole (bean's assigned: → persona + harness)
│   ├── spawn.ts       #   buildInvocationPrompt + spawnInvocation
│   ├── loop.ts        #   dispatchNext (the per-lane step function)
│   ├── done.ts        #   handleDone (/done route: verify + acknowledge)
│   ├── heal.ts        #   checkInvocation (self-heal poll: done? crash? wait?)
│   ├── rollup.ts      #   rollup (ancestry walk) + isMilestoneComplete + areAllEpicsCompleted
│   ├── squash.ts      #   squashRollup (fixup + autosquash into work commit)
│   ├── scan.ts        #   scanForNewLanes (tick-driven lazy worktree creation)
│   └── merge.ts       #   mergeBranch + mergeMilestoneToPrimary (conflict detection)
├── harness/           # buildPrompt, launchAgent, shellQuote
├── herdr/             # pane + worktree wrappers (shells out to herdr CLI)
├── storage/           # SQLite (db.ts: schema + pragmas; project.ts: git-common-dir key)
└── runtime.ts         # HordrDeps + gitMergeBranch + test seams
```

Every dispatch module is a **pure function with injected dependencies** —
testable in isolation, wired to real I/O by the daemon and command classes.

---

## The fleet model

### Bean hierarchy

```
milestone            ← one per release; gets the fleet
├─ epic              ← thematic container; gets a parallel worktree (lane)
│  ├─ feature        ← optional grouping for large epics
│  │  └─ task        ← one task = one commit; the executable unit
│  └─ task           ← tasks can sit directly under epics (feature is optional)
└─ ...
```

Features are **optional** — use them when an epic needs sub-grouping, skip them
for simple epics. Only `task` and `bug` beans are dispatched to agents;
features, epics, and milestones are containers that complete via rollup.

### Fleet = milestone + team + daemon broker

A fleet is the runtime instance of a team working a milestone. It is bounded
1:1:1 — one milestone → one fleet → one milestone integration branch
(`ms/<milestone-id>`). The daemon is the broker: it dispatches, rolls up, merges,
and self-heals. There is no Director agent — planning is external.

### Per-epic lanes (parallel)

Each unblocked epic under the milestone gets its own **lane**: a worktree
branched from the milestone integration branch, a pane, and a serialized
dispatch loop. Lanes are parallel across epics; tasks within a lane are
serialized (one at a time, driven by `--blocked-by` chains).

```
Fleet (milestone hordr-MS)
├── milestone branch: ms/hordr-MS (from primary, at fleet create)
│
├── Lane: epic-1 (unblocked at start)
│   ├── worktree from ms/hordr-MS → branch ms/hordr-MS/epic-1
│   ├── dispatch loop (serialized: task→task→task via --blocked-by)
│   └── on epic-complete: merge into ms/hordr-MS, teardown worktree
│
├── Lane: epic-2 (blocked-by epic-1 — no worktree yet)
│   └── when epic-1 merges → unblocked → worktree from ms/hordr-MS (has epic-1's code)
│
└── Lane: epic-3 (unblocked at start, parallel with epic-1)
    └── worktree from ms/hordr-MS → runs in parallel
```

### Lazy worktree creation

Worktrees are created **only when the epic becomes unblocked** — not at fleet
create. The milestone integration branch accumulates completed epics' merged
code. When an epic unblocks, its worktree branches from the current branch
state, so it **auto-inherits** earlier epics' code. No explicit merge-forward.

### One task = one commit

Each task bean produces exactly one commit. The agent commits code + bean
status; the daemon folds any rollup status changes into the same commit via
`git commit --fixup` + `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash`.
The commit SHA is rewritten (autosquash); the audit row records the post-squash
SHA.

### Self-heal, no timeouts

The daemon polls each active lane's current task on a tick (default 5s). If the
bean flipped to `completed` (whether via `/done` or forgotten), the daemon
proceeds. If the pane is gone and the bean isn't completed (crash), it marks the
task `blocked`. **No wall-clock timeouts** — the daemon never kills an agent for
taking too long. The human decides what's stuck.

### Merge conflicts → block, don't auto-resolve

If an epic→milestone merge conflicts, the lane enters `conflict` status. The
human resolves manually. The daemon detects the resolution on the next tick.
No agentic conflict resolution — it needs human judgment.

### Storage boundary

| Lives in **beans** (in-repo, committed)     | Lives in **SQLite** (daemon, machine-scoped)      |
| ------------------------------------------- | ------------------------------------------------- |
| Bean bodies, types, statuses, assignments   | Project registry (git-common-dir keys)            |
| Milestone's work contract + child task tree | Fleet rows (milestone, integration branch)        |
| Status rollup (task → epic → milestone)     | Lane rows (per-epic: worktree, pane, status)      |
| Dynamic beans (created mid-work)            | Invocation audit (task → commit sha → timestamps) |

The daemon **never mirrors bean status into SQLite**. It re-reads `.beans/` in
the worktree whenever it needs work-state. Crash recovery = restart and re-derive.

---

## Testing

```bash
bun run test          # full suite (Mocha + Chai + ESLint)
bun run typecheck     # tsc --noEmit
bun run lint          # ESLint
```

177 tests, all passing. Tests use module-level seams (`_setShellForTesting`,
`_setGitRunnerForTesting`) to mock beans/git/herdr — no real I/O in the test
suite.

---

## Architecture Decision Records

| ADR                                                          | Title                                      | Status                             |
| ------------------------------------------------------------ | ------------------------------------------ | ---------------------------------- |
| [0001](docs/adr/0001-standalone-herdr-plugin.md)             | Standalone OCLIF binary as a herdr plugin  | Active                             |
| [0002](docs/adr/0002-typescript-oclif-zod.md)                | TypeScript + OCLIF + Zod                   | Active                             |
| [0003](docs/adr/0003-fire-and-forget-run.md)                 | Fire-and-forget run model                  | Superseded by 0009 (fleet)         |
| [0004](docs/adr/0004-unix-socket-daemon-stub.md)             | Unix-socket daemon stub                    | Superseded by 0012 (broker)        |
| [0005](docs/adr/0005-worktree-per-bean.md)                   | Worktree-per-bean                          | Superseded by 0009 (per-milestone) |
| [0006](docs/adr/0006-bean-body-is-prompt.md)                 | Bean body is the agent prompt              | Active                             |
| [0007](docs/adr/0007-agent-companies.md)                     | Agent Companies support                    | Active                             |
| [0008](docs/adr/0008-no-lifecycle-state.md)                  | Hordr owns no lifecycle state              | Superseded by 0009 + 0012          |
| [0009](docs/adr/0009-fleet-serialized-milestone-dispatch.md) | Fleet: milestone-scoped team dispatch      | Active                             |
| [0010](docs/adr/0010-bean-projection-broker-no-timeouts.md)  | Bean-state-projection broker, no timeouts  | Active                             |
| [0011](docs/adr/0011-rollup-via-fixup-autosquash.md)         | Broker-owned rollup via fixup + autosquash | Active                             |
| [0012](docs/adr/0012-daemon-as-broker-with-sqlite.md)        | Daemon-as-broker with SQLite process state | Active                             |
| [0013](docs/adr/0013-dynamic-beans-draft-gated.md)           | Dynamic beans: draft-gated                 | Active                             |
| [0014](docs/adr/0014-per-epic-worktrees-lazy-creation.md)    | Per-epic worktrees with lazy creation      | Active                             |

---

## License

MIT © Fabian Schuh
