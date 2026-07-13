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
