# Hordr — Project Vision

> **PROJECT.md answers WHY hordr exists and WHAT it is.**
> For HOW to use it, see the [README](README.md).
> For the domain vocabulary, see [CONTEXT.md](CONTEXT.md).

---

## The problem

AI coding agents are powerful in isolation. But when you need a team of them
working the same codebase — three epics in parallel, each with implement →
test → review pipelines — the coordination overhead eats the productivity
gain. You end up babysitting:

- **Isolation.** Two agents touching the same files step on each other. Git
  worktrees solve this, but setting them up, branching, merging, and cleaning
  up is tedious.
- **Dispatch.** Which task should each agent work next? Dependency chains
  (`--blocked-by`) must be respected. Status must propagate up the tree. An
  agent that crashes needs re-dispatch.
- **Merging.** Parallel branches conflict. Someone has to resolve them,
  verify, and land the code.
- **Context.** Each agent needs the right prompt — not just the task, but the
  role, the conventions, the definition of "done."

Doing this by hand for one agent is fine. For a fleet of five, it's a
full-time job.

## What hordr is

Hordr is a **herdr plugin that orchestrates fleets of coding agents**. It
takes a bean tree (milestone → epics → tasks), assigns each task to an
agent in an isolated worktree, and drives the team to completion through a
stateless check loop.

```
You plan the work (beans)          Hordr runs the fleet (check loop)
                                   ┌──────────────────────────┐
┌────────────┐                     │  Lane 1: Login           │
│ Milestone  │──── hordr fleet ──→ │    implement → test      │
│  ├ Epic A  │     create          ├──────────────────────────┤
│  ├ Epic B  │                     │  Lane 2: Sessions        │
│  └ Epic C  │     hordr fleet     │    implement → test      │
└────────────┘     check (cron)    ├──────────────────────────┤
                                   │  Lane 3: Profile         │
                                   │    (blocked → unblocks)  │
                                   └──────────────────────────┘
                                              │
                                   hordr fleet finish
                                              ↓
                                        develop (primary)
```

**Two modes:**

1. **Single-bean** (`hordr run <bean>`) — one agent, one task,
   fire-and-forget. The simplest possible thing: worktree + pane + agent.
   No team coordination.

2. **Fleet** (`hordr fleet create <milestone>`) — a team of agents working
   a milestone in parallel. Each epic gets its own worktree (lane); tasks
   within an epic are serialized. Progress is driven by `hordr fleet check`
   — run it manually or via cron.

## What hordr is not

- **Not a planner.** Decomposition (milestone → epics → tasks) happens
  externally — a human planning session produces the bean tree. Hordr
  executes the tree; it doesn't design it.
- **Not a daemon.** No long-running process. `hordr fleet check` is a
  stateless one-pass command. Cron it for autonomy; run it by hand when
  watching (ADR-0015).
- **Not an output parser.** The agent's pane is the agent's business. Hordr
  reads bean status (the universal control surface), not agent stdout.
- **Not a merge bot.** Merge conflicts are escalated to a merger agent
  (tier 3), not silently auto-resolved. The human decides what's stuck.
- **Not stateful about work.** Bean status lives in beans. Hordr's SQLite
  holds only process state (which lanes exist, which panes are live). Crash
  recovery = re-derive from beans.

## Core design principles

1. **Beans is the universal control surface.** Every status transition, every
   dependency, every assignment lives in `.beans/`. Hordr reads it; it never
   mirrors it. This eliminates an entire class of state-sync bugs.

2. **Isolation via worktrees.** Every agent works in its own git worktree.
   No file conflicts, no stash juggling, no "wait your turn." Parallel epics
   are truly parallel.

3. **Lazy creation = dependency resolution.** Worktrees are created only when
   an epic unblocks — not at fleet creation. The newly-unblocked epic branches
   from the current integration branch, which already contains the blocking
   epic's merged code. No explicit merge-forward.

4. **No timeouts.** Agent wall-clock is unpredictable. A "stuck" agent might
   be thinking, waiting for a human prompt, or genuinely hung. Hordr never
   kills an agent for taking too long. The human decides.

5. **One task = one commit.** Each task produces exactly one commit (code +
   bean status flip together). Rollup status changes land as a separate
   `chore(beans)` commit. Clean provenance, reviewable history.

6. **Stateless check loop.** The pure dispatch functions are the value; the
   process wrapping them was ceremony. `hordr fleet check` is idempotent —
   run it once or a thousand times, the result is the same. Overlapping runs
   are guarded by a PID-file lock.

## The merge model

Hordr uses a 3-tier merge escalation for both epic→integration and
integration→primary merges:

```
Tier 1: git merge --ff-only     →  clean fast-forward, no merge commit
Tier 2: git merge --no-ff       →  merge commit
Tier 3: conflict in-progress    →  spawn merger agent to resolve
```

On any successful tier, the source worktree is removed and the source branch
is deleted — only on success, never on conflict. Tier 3 spawns a merger
agent (a role-configured harness) that runs in the target worktree, resolves
the conflicts, commits, and stops. The next `hordr fleet check` detects
completion and finishes the teardown.

## Architecture at a glance

```
src/
├── commands/          CLI entry points (run, finish, done, fleet/*, prime, cleanup)
├── beans/             beans CLI client (read-only + status transitions)
├── config/            Zod schema + loader + zero-config defaults
├── company.ts         Agent Companies manifest parsing
├── dispatch/          Pure-function fleet dispatch core (injected deps):
│   ├── engine.ts        scanFleet + advanceLane + continueTask
│   ├── dispatch.ts      getDispatchable (subtree ∩ ready, priority sort)
│   ├── merge.ts         3-tier attemptMerge + mergeBranch
│   ├── merger.ts        merger agent spawn + conflict file detection
│   ├── rollup.ts        ancestry walk + milestone completion
│   ├── heal.ts          crash detection + pane liveness
│   ├── spawn.ts         invocation prompt + harness launch
│   ├── loop.ts          per-lane dispatch step
│   ├── continue.ts      in-place continuation after /done
│   ├── done.ts          done acceptance gate
│   ├── scan.ts          lazy lane creation
│   ├── lane-create.ts   worktree + pane + branch for new epic
│   ├── pane-heal.ts     dead pane recreation
│   ├── commit-beans.ts  idempotent .beans/ commit
│   └── advance/tick.ts  (legacy, test-only)
├── fleet/             lifecycle: createFleet, finishFleet, abortFleet, resetLane
├── harness/           buildPrompt, buildHarnessCommand, resolveHarness
├── herdr/             pane + worktree wrappers (shells out to herdr CLI)
├── storage/           SQLite: fleets, lanes, projects, lock
└── logger.ts          stderr logger
```

Every dispatch module is a **pure function with injected dependencies**.
Tests mock the I/O; the engine and commands wire the real implementations.

## Design evolution

Hordr went through four phases (15 ADRs, linked from the README):

1. **Stateless plugin (ADR 0001–0008):** Fire-and-forget `hordr run`. No
   state, no engine, no fleet. One bean, one worktree, one agent.

2. **Fleet reconquest (ADR 0009–0012):** Team-of-agents working a milestone
   needs coordination. Introduced the fleet, lanes, a daemon broker, and
   SQLite — but with a strict boundary: beans own work-state, SQLite owns
   only process state.

3. **Refinement (ADR 0013–0014):** Dynamic beans stay draft-gated. Per-epic
   lanes replace one-shared-worktree for real parallelism with lazy
   cross-epic dependency resolution.

4. **Daemonless (ADR 0015):** The long-running process was never load-bearing
   — the pure dispatch functions were. Daemon → stateless `fleet check`
   (cron-driven) + inline `hordr done`. Simpler failure surface, identical
   dispatch core.

The throughline: **beans is the universal control surface; hordr is a dumb
dispatcher that owns only what beans structurally cannot express.**
