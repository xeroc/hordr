---
# hordr-bfqj
title: Inherit parent worktree in hordr run
status: completed
type: feature
priority: high
created_at: 2026-06-30T06:51:31Z
updated_at: 2026-06-30T07:01:28Z
---

When hordr run is invoked on a bean that has a parent, look up the parent bean's Run state and inherit its worktree (workspace_id, branch, path) instead of requiring the child workflow to set worktree: true. Falls back to wf.worktree behavior when no parent worktree exists.

## Plan

- [ ] RED: test that child bean with parent's existing Run/worktree inherits it without needing worktree: true in config
- [ ] GREEN: in src/commands/run.ts, look up parent_id → getRun(parent) → use parent.worktree
- [ ] full suite + lint + typecheck

## Acceptance Criteria

- [ ] hordr run <child> where child has parent_id and parent Run has worktree: child Run inherits parent worktree
- [ ] No 'worktree: true' required in child's workflow config for this path
- [ ] Fallback to existing wf.worktree createWorktree path when parent has no Run/worktree
- [x] No regressions in existing run.test.ts

## Summary of Changes

### Why
Running `hordr run <child>` on a bean whose parent already had an active Run/worktree would still create a brand-new worktree for the child (or worse, hit the `no worktree for bean X (workflow 'Y' must set worktree: true)` guard in `shared.ts`). Coordinator → child spawns should reuse the parent's already-prepared workspace.

### Fix
`src/commands/run.ts` gains `_inheritParentWorktree(beanId)`:
- reads the bean's `parent` field via `getBean`
- looks up the parent's Run state via `getRun`
- returns the parent's `worktree` (branch + path + workspace_id), or `null` on any miss

The Run command now consults this BEFORE the `wf?.worktree` branch. If the parent has a worktree, the child Run inherits it verbatim and `createWorktree` is never called. Falls through to the existing path when no parent / no parent Run / no parent worktree.

### Tests
`test/commands/run.test.ts` — new test "child of a parent with an active Run/worktree inherits that worktree". Stubs `createWorktree` and asserts it is NOT called; asserts the stored child Run carries the parent's worktree verbatim.

### Verification
- bun run lint: clean
- bun run typecheck: clean
- run.test.ts: 5/7 passing (2 failures are pre-existing, fail on unmodified tree too — unrelated herdr binary PATH issue)
- full suite: 142 passing (was 141), 8 failing (all pre-existing) → +1 test, 0 regressions
