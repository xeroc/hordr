# Quick Start

End-to-end smoke test: create an epic, decompose it, run a child.

> Run these inside a **herdr session** (so pane spawning works).

## Step 1: Create an Epic Bean

```bash
cd /path/to/your/project

beans create "Test decomposition flow" -t epic -s todo -d "Split this epic into 2 small tasks: one that adds a hello() function, one that adds a goodbye() function. Keep it simple — this is a smoke test."
```

Note the bean ID (e.g. `hordr-XXXX`).

## Step 2: Decompose the Epic

```bash
hordr decompose <epic-id>
```

Spawns a planner pane (opencode with the planner persona). The planner reads the epic body, creates child task beans, fills the Decomposition section, and signals done. Epic → completed.

Watch the new pane — opencode should start processing immediately.

## Step 3: Check the Children

```bash
beans list
```

Look for new task beans with `parent=<epic-id>`.

## Step 4: Run a Child

```bash
hordr run <child-id>
```

Creates a Run, worktree (if the workflow has `worktree: true`), and spawns a supervisor pane. The supervisor drives the agent steps (implementer, tester, reviewer) and blocks at the HITL gate.

## Step 5: Check Status

```bash
hordr status
```

Shows all runs with state, step, and pane refs.
