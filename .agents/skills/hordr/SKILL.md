---
name: hordr
description: Hordr — worktree isolation + fleet dispatch for coding agents. Use when working within a hordr-managed project: running/finishing tasks, planning milestones, or operating in fleet mode.
---

# Hordr — Agent Guide

## Install

If you see this skill loaded but hordr isn't available, install it:

```bash
git clone https://github.com/herdr/hordr.git
cd hordr
bun install
bun run build
herdr plugin link .
```

The `hordr` binary is now on PATH. Confirm: `hordr --help`.

---

Complements `beans prime` (beans CLI). This covers hordr-specific concepts only.

## Bean hierarchy (mandatory)

Every body of work large enough to warrant a release ships as a **milestone**
bean with a fixed type hierarchy. The bean `type` MUST match its level:

```
milestone            ← one per release / main topic
├─ epic              ← thematic container, NEVER worked on directly
│  ├─ feature        ← user-facing capability or distinct deliverable
│  │  └─ task        ← concrete, grabbable unit of work
│  └─ ...
└─ ...
```

Wire parents: `--parent <id>`. Wire dependencies: `--blocked-by <id>`.

### Fleet dispatch needs epic + task layers — leaf features under a milestone stall

The daemon's lane scanner (`scanForNewLanes`) treats each **direct child of
the milestone** as a lane candidate and calls `hasReadyWork(childId)`, which
checks for dispatchable **descendants** under it. A leaf node is never its own
descendant, so:

- **milestone → feature(leaf)** stalls forever — the feature has no task
  children, so `getDispatchable` returns `[]`, `hasReadyWork` is false, no lane
  is created, the daemon logs "not ready" every tick and does nothing.
- **milestone → epic → task** works — the epic is the lane root, tasks are
  dispatched as descendants within it.
- **milestone → epic → feature(leaf)** also works — a childless feature IS
  executable (`feature` is in `EXECUTABLE_TYPES`), it just has to be a
  _descendant_ of the lane epic, not a direct child of the milestone.

**Rule:** every milestone under fleet dispatch MUST have at least one epic
child, and that epic MUST have at least one task or leaf-feature descendant.
If you're planning a milestone and its work items are small (one commit each),
wrap them in a single epic rather than hanging them directly off the milestone.

Reparent a misstructured milestone in one pass:

```bash
EPIC=$(beans create --json "Implementation" -t epic --parent MS_ID -s todo \
       | jq -r .bean.id)
for id in <child-ids...>; do beans update "$id" --parent "$EPIC"; done
```

## Roles and the assigned: convention

Every task carries `assigned: <role>` in its YAML frontmatter. Default roles:

- **implementer**: writes code, commits. Default when assigned: is missing.
- **tester**: writes tests, runs them, reports failures.
- **reviewer**: reviews the diff, approves or blocks.

```yaml
---
title: Implement the frobnicator
type: task
status: todo
assigned: implementer
---
```

## Planning a milestone

1. Decompose into epics (parallel) and tasks (serialized within each epic).
2. Assign each task to a role via `assigned:`.
3. Chain implement → test → review via `--blocked-by`:

```bash
beans create "Implement X" -t task --parent EPIC
beans create "Test X" -t task --parent EPIC --blocked-by <implement-id>
beans create "Review X" -t task --parent EPIC --blocked-by <test-id>
```

4. Cross-epic deps: `beans create "Profile" -t epic --parent MS --blocked-by <auth-epic>`
   Blocked epics get no worktree until their blocker merges (lazy creation).
5. Write the `## HANDOFF` section into the milestone body **at creation time**
   (see [Milestone HANDOFF](#milestone-handoff-mandatory)). It is the planning
   output every descendant task inherits.

## Milestone HANDOFF (mandatory)

The milestone body is not just a label — it is the **planning handoff** for
every task that descends from it. When the daemon spawns a task, it injects the
full ancestor chain (milestone → epic) into the task's prompt as read-only
context. So whatever lives in the milestone body reaches every
implementer / tester / reviewer automatically. **No per-task repetition.**

**Rule:** every milestone bean body MUST end with a `## HANDOFF` section,
authored **at creation time** (in the `beans create ... -t milestone -d` body) —
never as a deferred `beans update`. Fill what the grilling session resolved;
mark anything still open `TBD` rather than inventing it. If a later session
supersedes part of it, append a `### Rewritten scope (date — supersedes above)`
block in place; do not scrap accumulated context.

### Why it matters

A handoff that cannot answer _"if this fails in production at 2 AM, where does
the bug live and how do I find it?"_ is a failed handoff. The HANDOFF makes the
failure modes obvious before a single task is dispatched.

### Template (AI-agent format — strict headers, imperative, no prose padding)

```markdown
## HANDOFF

### 1. Happy Path

<numbered flow — e.g. 1. agent calls X, 2. daemon validates Y, 3. system returns Z>

### 2. Data Contract

- Public surface: <function/type signatures, CLI flags, bean fields — exact names, no synonyms>
- Modules touched: <src/dispatch/foo.ts, src/beans/...>
- New bean types/fields (if any): <...>

### 3. Edge Cases & Constraints

- <what NOT to do, trust boundaries, limits — e.g. "never write bean status outside rollup (client.ts:5-7)">

### 4. Business Logic (pseudo-code, target language)

<reference logic — primes token prediction; keep it short>

### 5. Definition of Done

- [ ] <testable criterion — e.g. "unit test covers the null case">
- [ ] lint clean, build green
- [ ] <...>

### 6. Test Matrix (Given / When / Then)

- Given <context>, When <action>, Then <outcome>

### 7. Open Questions

- <deferred decisions — record an assumption and proceed; do not freeze>
```

Children inherit this verbatim via ancestor injection; **do not copy it into
epic or task bodies** — reference the milestone (`see milestone <id> HANDOFF §N`)
and add only the task-local detail.
