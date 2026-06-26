---
# hordr-1702
title: Event hook handlers (worktree.created, worktree.removed)
status: completed
type: task
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T17:53:05Z
parent: hordr-1007
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

## Summary of Changes

**Discovered event payload format** by triggering real `herdr worktree create` with the plugin enabled and capturing the env vars herdr passes to event hooks:
- `HERDR_PLUGIN_EVENT` = event name (e.g. 'worktree.created')
- `HERDR_PLUGIN_EVENT_JSON` = JSON envelope: `{event, data: {type, workspace: {workspace_id, worktree: {checkout_path}}, worktree: {branch, path, open_workspace_id}}}`
- `HERDR_PLUGIN_ID` = 'herdr.hordr'
- `HERDR_PLUGIN_STATE_DIR` = per-plugin state dir (already consumed by run-store.ts)
- `HERDR_PLUGIN_CONFIG_DIR` = per-plugin config dir

**New files:**
- src/events/payload.ts: readWorktreeEvent() + beanIdFromBranch(branch, prefix) helpers. zod-validated envelope. EventPayloadError on malformed/missing payload.
- src/commands/on-worktree-created.ts: reads event, extracts bean id from branch (via config.worktree_branch_prefix), updates Run.worktree with new workspace_id + path. Idempotent. No-op for non-hordr branches or missing runs. Clears 'removed' tombstone if worktree is recreated.
- src/commands/on-worktree-removed.ts: marks all Runs referencing the removed workspace_id with worktree.removed=true. Preserves branch + workspace_id (close-merged still needs them for gh pr view --branch). Idempotent.

**Schema extension:** added optional 'removed: boolean' field to RunState.worktree. Acts as a tombstone — handlers can check worktree.removed to skip herdr calls that would fail against a gone workspace, while close-merged still finds PRs by branch name.

**Tests:** test/commands/event-hooks.test.ts — 10 tests covering both hooks (happy path, idempotency, non-matching branch, missing run, tombstone clearing on recreate, isolation across workspaces, multi-run same workspace, no-op when nothing to do).
