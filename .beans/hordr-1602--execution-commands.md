---
# hordr-1602
title: Execution commands (run, advance, supervise, take, reset)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1006
order: F2
---

## Requirement

Wire the execution-phase commands. These drive a bean through its workflow.

## Spec

`run <bean>`: enqueue (or start immediately), spawn supervisor pane running `hordr supervise <bean>`. `advance <bean>`: one step, print result. `supervise <bean>`: blocking loop (runs inside the supervisor pane). `take <bean>`: focus the blocked agent pane (`herdr tab focus` + `herdr pane focus` on the blocked pane's label). `reset <bean>`: delete Run state, `herdr worktree remove`, delete branch, bean → `todo`. Confirm before destructive reset unless `--force`.

## Acceptance Criteria

- [ ] `hordr run <bean>` creates a worktree and starts the workflow
- [ ] `hordr advance <bean>` executes one step and prints the new state
- [ ] `hordr supervise <bean>` blocks until `pr-open` or `blocked`
- [ ] `hordr take <bean>` focuses the blocked pane in herdr
- [ ] `hordr reset <bean>` without `--force` prompts for confirmation

## Test Plan

Integration inside herdr: run a bean through to implement step, advance manually, verify state. Test reset cleans up worktree + state.
