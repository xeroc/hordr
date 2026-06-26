---
# hordr-1301
title: Herdr worktree lifecycle wrapper
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1003
order: C1
---

## Requirement

Create, open, and remove worktrees through herdr's CLI (`HERDR_BIN_PATH`), not git directly.

## Spec

Create `src/herdr/worktree.ts`. Functions: `createWorktree({base, branch, focus?})`, `openWorktree({path|branch, focus?})`, `removeWorktree({workspaceId, force?})`. All call `$HERDR_BIN_PATH worktree <subcommand>`. Parse JSON output for workspace/tab/pane ids.

## Acceptance Criteria

- [ ] `createWorktree` returns `{workspace_id, branch}`
- [ ] `openWorktree` returns `{workspace_id}` (existing or new)
- [ ] `removeWorktree` succeeds and the workspace is gone
- [ ] Branch naming follows `hordr.worktree_branch_prefix + beanId`

## Test Plan

Integration test inside a running herdr session. Create, open, remove cycle. Verify workspace list reflects changes.
