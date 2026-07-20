# Hordr — Agent Development Guide

Hordr is a herdr plugin that gives coding agents isolated git worktrees and
panes, with beans as their briefs. Two modes: single-bean (`hordr run`) and
fleet (a team working a milestone in parallel, each epic in its own worktree,
advanced by `hordr fleet check` — no long-running daemon, ADR-0015). See
README.md for the full feature set and docs/fleet-guide.md for the fleet model.

## Before You Start

Run `beans prime` and heed its output. When making a commit, include the
relevant bean IDs in the commit message.

## Project Layout

```
src/
├── commands/          OCLIF command classes (run, finish, cleanup, done, prime, fleet/*)
├── beans/             beans CLI client (getBean, getBody, markBeanCompleted, resetBeanToTodo)
│                      + dir.ts (resolveBeansDir: reads .beans.yml, default '.beans')
├── config/            schema (Zod), loader, defaults (zero-config agents)
├── company.ts         Agent Companies manifest parsing (AGENTS/PROJECT/SKILL/COMPANY.md)
├── dispatch/          the fleet dispatch core — pure functions with injected deps:
│   ├── engine.ts      createFleetEngine: scanFleet + advanceLane + continueTask (production)
│                      Top-level helpers: rollupSweep, rollupAncestors, mergeEpicLane,
│                      maybeCompleteMilestone (milestone auto-complete, hordr-45f3),
│                      refreshLaneIfStale (cross-epic blocker ff-merge, hordr-lcsi).
│                      scanFleet loop owns: lane scan, stale-done cleanup (hordr-sq00),
│                      worktree recreation, milestone completion sweep.
│   ├── dispatch.ts    getDispatchable (subtree ∩ --ready, priority sort)
│   ├── role.ts        resolveRole (bean's assigned: → persona + harness)
│   ├── spawn.ts       buildInvocationPrompt + spawnInvocation
│   ├── loop.ts        dispatchNext (per-lane step function)
│   ├── continue.ts    continueLane (in-place continuation after /done)
│   ├── done.ts        handleDone + runDoneChecks (done acceptance gate)
│   ├── heal.ts        checkInvocation (self-heal: done? crash? wait?)
│   ├── rollup.ts      rollup + isMilestoneComplete + areAllEpicsCompleted
│   ├── commit-beans.ts commitBeanChanges (idempotent: stages + commits .beans/)
│   ├── lane-create.ts createLaneForEpic (worktree + pane + branch for a new epic)
│   ├── pane-heal.ts   ensureLanePane (recreate/reattach dead panes)
│   ├── scan.ts        scanForNewLanes (lazy worktree creation)
│   ├── merge.ts       mergeBranch + mergeMilestoneToPrimary (conflict detection)
│   ├── advance.ts     ⚠ LEGACY — old per-lane step. Only test/helpers/fleet-engine.ts imports it. Candidate for deletion (see note below).
│   └── tick.ts        ⚠ LEGACY — old broker scan loop. Only test/helpers/fleet-engine.ts imports it. Candidate for deletion (see note below).
├── fleet/             lifecycle.ts: createFleet, describeFleet, finishFleet, abortFleet, resetLane
├── harness/           buildPrompt, buildHarnessCommand, resolveHarness, launchAgent, shellQuote
├── herdr/             pane + worktree wrappers (shells out to herdr CLI)
├── storage/           SQLite (db.ts: schema + pragmas; fleets.ts: fleet/lane/project rows;
│                      project.ts: git-common-dir key; lock.ts: fleet-check PID mutex)
├── logger.ts          stderr logger (debug/info/warn/error)
└── runtime.ts         HordrDeps + gitMergeBranch + GitRunner test seam
```

Every dispatch module is a **pure function with injected dependencies**
(`ShellFn`, `GitFn`, `DispatchDeps`, etc.). Tests mock the deps; `engine.ts`
and the command classes wire the real I/O. Follow this pattern for new modules.

> **engine.ts vs advance.ts/tick.ts:** production runs through `engine.ts`
> (`createFleetEngine`, wired by `fleet/create`, `fleet/check`, and `done`).
> `advance.ts` and `tick.ts` are the pre-ADR-0015 implementations kept alive
> by `test/helpers/fleet-engine.ts`; they are not in the production call path.
> When adding new dispatch logic, modify `engine.ts` — and prefer moving the
> orphaned tests over to the production engine rather than extending the
> legacy pair.
>
> **Status (Jul 2026):** engine.ts is now feature-complete vs tick.ts. The
> three behaviors that previously lived only in tick.ts were ported in
> hordr-sq00 (stale-done lane cleanup), hordr-45f3 (milestone auto-complete),
> and hordr-lcsi (cross-epic blocker refresh). The legacy pair is now strictly
> redundant as a _reference_ implementation. Their only remaining value is
> backing 19 tests via `test/helpers/fleet-engine.ts` (TestFleetEngine mock).
> **Recommended cleanup:** delete `tick.ts`, `advance.ts`, and the
> `TestFleetEngine` helper in one PR; migrate or delete the 19 tests
> (most are redundant with the production-engine tests in
> `test/dispatch/engine.test.ts`). This is a mechanical refactor, not a
> behavior change — both implementations call the same shared helpers
> (`rollup.ts`, `scan.ts`, `heal.ts`, `dispatch.ts`).
>
> **Bug class to remember:** when a future port moves logic between modules,
> diff "what does the old place do that the new place doesn't" — all three
> 2026-07 bugs were missing ports, found by exactly that diff.

## Beans — Structure and Planning

### Bean type hierarchy

```
milestone            ← one per release / main topic; gets the fleet
├─ epic              ← thematic container; gets a parallel worktree (lane)
│  ├─ feature        ← user-facing deliverable (optional intermediate level)
│  │  └─ task        ← concrete unit of work; one task = one commit
│  └─ task           ← tasks can sit directly under epics
└─ ...
```

Levels map 1:1 to types: `milestone` → `epic` → `feature` → `task`. Never skip
a level (no `task` directly under a `milestone`). Epics and milestones are
containers — they hold children, they are not executed. Wire parents with
`--parent`.

**Epic vs feature:** epic groups work by theme and gets its own parallel
worktree. Feature is an optional intermediate grouping within an epic. Task is
the executable unit — one task produces one commit.

### Planning a milestone

When planning work on hordr, decompose the milestone into epics and tasks.
Each epic becomes a parallel lane (its own worktree). Tasks within an epic are
serialized. Cross-epic dependencies use `--blocked-by` — a blocked epic gets no
worktree until its blocker merges.

### The `assigned:` frontmatter convention

**Every task bean carries an `assigned:` field** naming the role that should
work it. The default roles are:

| Role          | Harness    | What it does                                              |
| ------------- | ---------- | --------------------------------------------------------- |
| `implementer` | `opencode` | Implements the task: reads the bean, writes code, commits |
| `tester`      | `opencode` | Tests the task: writes tests, runs them, reports failures |
| `reviewer`    | `opencode` | Reviews the task: checks the diff, approves or blocks     |

Example task bean with assignment:

```markdown
---
title: Implement the frobnicator
type: task
status: todo
priority: high
assigned: implementer
---

## Requirement

Build the frobnicator module.

## Acceptance Criteria

- [ ] It frobs
- [ ] Tests pass
```

When creating task beans during planning, **always set `assigned:`** to the
appropriate role. Missing `assigned:` defaults to `implementer` (with a
warning). Unresolvable roles (not in config) cause the engine to block the
task.

### Implement → test → review pipelines

Use `--blocked-by` to chain tasks into a pipeline within an epic:

```bash
beans create "Implement X" -t task --parent hordr-EPIC
# → hordr-0001

beans create "Test X" -t task --parent hordr-EPIC \
  --blocked-by hordr-0001
# → hordr-0002 (not ready until 0001 completes)

beans create "Review X" -t task --parent hordr-EPIC \
  --blocked-by hordr-0002
# → hordr-0003 (not ready until 0002 completes)
```

The engine dispatches only unblocked tasks (`beans list --ready`). After
`hordr-0001` completes, `hordr-0002` becomes ready, then `hordr-0003`. This
creates the implement → test → review pipeline naturally.

### Cross-epic dependencies

```bash
beans create "Profile page" -t epic --parent hordr-MS \
  --blocked-by hordr-AUTH-EPIC
```

Epic `hordr-PROFILE-EPIC` gets no worktree until `hordr-AUTH-EPIC` merges.
When it unblocks, its worktree branches from the milestone integration branch
(`ms/<id>`) which now contains the auth epic's code — lazy creation is
automatic dependency resolution.

### Dynamic beans (mid-work)

An agent may discover new work during a task. It creates beans via `beans
create ... -s draft`. Dynamic beans land in `draft` status — the human reviews
and flips to `todo` to dispatch them. The engine never auto-dispatches draft
beans.

### Status flow

Status flows up automatically via the engine's rollup: a parent is `completed`
only when all descendants are `completed`. The agent does NOT walk the tree or
propagate status — the engine owns rollup. Rollup writes (`.beans/` status
changes) are committed by the engine as a separate `chore(beans): rollup
status changes` commit via `commitBeanChanges` (idempotent: a no-op when
nothing is staged). ADR-0011 specified fixup+autosquash into the work commit;
that folding was never wired and the design was amended — see
`docs/adr/0011-rollup-via-fixup-autosquash.md`.

## Bean Hygiene

1. **Check before creating.** Run `beans list --json` and scan for existing
   beans covering the same scope. Duplicates waste context.
2. **Restructuring.** When a design session changes scope, rewrite bean bodies
   by appending a `## REWRITTEN SCOPE (date — supersedes content above)`
   section. Don't scrap beans that have accumulated context; rewrite in place.
3. **Design decisions → milestone body.** Capture architectural decisions in
   the milestone body with struct layouts, flow diagrams, and rationale.
   Individual tasks carry the acceptance criteria (TDD checklist).
4. **Active milestones may supersede code state.** ADRs describe the current
   deployed architecture. An active milestone's body may contain design
   decisions that will change the code but haven't landed yet. Always check
   `beans list --json --ready` for in-flight work before assuming the docs
   reflect reality.

## Development Workflow

### TDD

RED → GREEN → REFACTOR for every feature/bug fix. Tests first. No exceptions.

### Pure-function pattern

New dispatch logic follows the established pattern:

```typescript
// src/dispatch/something.ts
export interface SomethingDeps {
  fetchX: (id: string) => X
  doY: (val: string) => void
}

export function doSomething(id: string, deps: SomethingDeps): Result {
  // pure logic, no I/O — all side effects through deps
}

// test/dispatch/something.test.ts
// Mock the deps, test the logic. No real beans/git/herdr calls in tests.
```

### Shell seams

Tests mock `beans`, `git`, and `herdr` via module-level seams
(`_setShellForTesting`, `_setGitRunnerForTesting`). Never make real I/O calls
in tests.

### Lint is law

Fix all lint errors before commit. The project uses `eslint-config-oclif` with
`@oclif/prettier-config` (`bracketSpacing: false`, `singleQuote: true`,
`semi: false`). Run `bun run lint` before committing.

### Commit convention

Use the commit skill. Include bean IDs in the commit message:

```
feat(dispatch): add ephemeral invocation spawn for fleet dispatch

...

Refs: hordr-iubj
```

Do NOT prefix with an emoji — pre-commit's `gitmojify` hook handles that.
