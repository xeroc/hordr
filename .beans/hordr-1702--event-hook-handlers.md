---
# hordr-1702
title: Event hook handlers (worktree.created, worktree.removed)
status: todo
type: task
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1007
order: G2
---

## Requirement

Keep Run state synchronized when herdr creates or removes worktrees outside of hordr's direct control.

## Spec

Create `hordr on-worktree-created` and `hordr on-worktree-removed` commands. These receive `HERDR_PLUGIN_EVENT_JSON` with the worktree + workspace info. `on-worktree-created`: if the branch matches `bean/<bean-id>`, update the Run's worktree workspace_id. `on-worktree-removed`: if a Run's worktree workspace was removed, mark the worktree ref as gone (but don't delete the Run — it may be `pr-open` waiting for merge).

## Acceptance Criteria

- [ ] `on-worktree-created` with a `bean/` branch updates the matching Run
- [ ] `on-worktree-created` with a non-`bean/` branch is a no-op
- [ ] `on-worktree-removed` nulls the Run's worktree workspace_id
- [ ] Handlers are idempotent (safe to fire multiple times)

## Test Plan

Fire the events with mock JSON payloads. Verify Run state updates. Test with non-matching branches (no-op). Test idempotency.
