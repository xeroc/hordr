---
# hordr-1007
title: Herdr plugin manifest and event hooks
status: todo
type: epic
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
order: G
---

Register hordr as a herdr plugin via `herdr-plugin.toml` and handle worktree lifecycle events.

## Requirement

Herdr surfaces hordr actions in its UI and fires event hooks on worktree lifecycle. The manifest must declare actions, events, and the plugin metadata.

## Spec

The manifest maps each `hordr` subcommand to a herdr action. Event hooks on `worktree.created` and `worktree.removed` call `hordr on-worktree-created` / `on-worktree-removed` to keep Run state synchronized with herdr's worktree view.

## Acceptance Criteria

- [ ] `herdr plugin link` succeeds against the manifest
- [ ] `herdr plugin action list --plugin herdr.hordr` shows all actions
- [ ] Event hooks fire on worktree create/remove
- [ ] `on-worktree-created` updates Run state with the new workspace id
- [ ] `on-worktree-removed` marks the Run's worktree ref as gone

## Test Plan

Link the plugin in a running herdr session. Trigger a `herdr worktree create` and verify the event hook fires and Run state updates.
