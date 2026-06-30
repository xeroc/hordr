---
# hordr-ehst
title: Walk parent chain recursively in _inheritParentWorktree
status: completed
type: task
priority: high
created_at: 2026-06-30T07:05:46Z
updated_at: 2026-06-30T07:21:23Z
blocked_by:
    - hordr-bfqj
---

Follow-up to hordr-bfqj. Beans can be nested at multiple levels (epic → feature → task → subtask). The single-hop parent lookup misses cases where a grandchild needs to inherit from a grandparent because the intermediate parent has no Run.

## Plan

- [ ] RED: test that grandchild (parent has no Run, grandparent has Run+worktree) inherits grandparent worktree
- [ ] RED: test cycle guard (A → B → A) terminates
- [ ] GREEN: loop up parent chain in _inheritParentWorktree with a visited set
- [ ] lint + typecheck + suite

## Acceptance Criteria

- [ ] Grandchild inherits from any ancestor that has a Run with worktree
- [ ] Cycle in parent chain terminates cleanly (returns null)
- [x] No regressions

## Summary of Changes

### Why
Beans nest arbitrarily deep (epic → feature → task → subtask). hordr-bfqj's single-hop lookup only checked the immediate parent. A grandchild whose parent had no Run would miss a perfectly good worktree on the grandparent and fall through to createWorktree.

### Fix
`src/commands/run.ts` `_inheritParentWorktree` rewritten as a loop:
- Start at the bean, walk up `bean.parent` until an ancestor's Run has a worktree.
- `visited: Set<string>` guards against cyclic parent links (returns null instead of hanging).
- Any error (missing bean, missing Run, etc.) → null, falls through to wf.worktree path.

### Tests
`test/commands/run.test.ts`:
- 'walks the parent chain: grandchild inherits grandparent worktree when intermediate parent has no Run' — RED→GREEN
- 'cycle guard: a cyclic parent chain terminates and returns null (no infinite loop)' — relies on mocha's default 2s timeout to catch hangs; verifies the run falls through to createWorktree correctly after the cycle is detected

### Verification
- npx eslint src/commands/run.ts test/commands/run.test.ts: 0 errors
- bun run typecheck: clean
- run.test.ts: 7/9 passing (2 pre-existing unrelated herdr PATH failures)
- full suite: 144 passing (was 142), 8 failing (all pre-existing) → +2 tests, 0 regressions
