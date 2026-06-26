---
# hordr-1003
title: Herdr CLI integration
status: todo
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
order: C
---

Wrap the herdr CLI (`HERDR_BIN_PATH`) for worktree lifecycle, pane management, pane labeling, wait helpers, and notifications.

## Requirement

Hordr drives worktrees, panes, and waits through herdr's socket API via the CLI wrapper. Panes must be labeled with `hordr:<bean-id>:<role>` and resolvable by label (pane ids compact on close).

## Spec

All herdr calls go through `HERDR_BIN_PATH` for portability. Pane label resolution filters `herdr pane list` output by the `hordr:` prefix label. Wait helpers wrap `herdr wait output` and `herdr wait agent-status`.

## Acceptance Criteria

- [ ] Can create, open, and remove worktrees via `herdr worktree`
- [ ] Can split a pane with a `hordr:` label and run a command in it
- [ ] Can find a pane by label across the workspace
- [ ] `wait output` returns on regex match or timeout
- [ ] `wait agent-status` returns on status match or timeout
- [ ] Notification helper wraps `herdr notification show`

## Test Plan

Integration test inside a running herdr session: create workspace, split labeled pane, send text, read it back, find by label. Unit test the label parsing logic.
