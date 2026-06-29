---
# hordr-jqw9
title: Add --base flag to hordr run + tolerate pre-existing worktree branch
status: completed
type: feature
priority: high
created_at: 2026-06-29T18:17:54Z
updated_at: 2026-06-29T18:43:22Z
---

Add --base flag to hordr run that selects the base branch when creating a worktree. Also, when worktree create fails because the branch already exists, treat the worktree as already there and recover by opening it instead of erroring out.

## Plan

- [x] RED: tests for openWorktree helper + run --base flag + recovery on 'already exists'
- [ ] GREEN: add openWorktree to src/herdr/worktree.ts
- [ ] GREEN: thread --base through EngineDeps.createWorktree + commands/run.ts
- [ ] GREEN: recovery in src/runtime.ts (fall back to openWorktree)
- [x] lint + typecheck + full test suite green (no new failures vs baseline; pre-existing failures on main untouched)

## Summary of Changes

### `hordr run <bean> --base <ref>`
- New flag on `src/commands/run.ts` → threads through to `EngineDeps.createWorktree(beanId, {base})`.
- Falls back to `config.primary_branch` when not given.

### Tolerate pre-existing worktree branch
- `src/runtime.ts` catches HerdrError matching `/a branch named '…' already exists/i` from `herdr worktree create` and falls back to the idempotent `herdr worktree open --branch …`, returning the existing workspace_id. Any other create error re-throws.

### New helper
- `openWorktree({branch|path, cwd|workspaceId})` in `src/herdr/worktree.ts` mirrors `createWorktree`'s shape. Shared response parser extracted (`parseWorktreeResult`) since create and open return the same envelope.

### Tests (+11, 0 regressions)
- `test/herdr/worktree.test.ts`: 6 new tests for `openWorktree` (args, --path, validation, error envelope).
- `test/runtime.test.ts` (new): 4 tests — default --base from config, override via opts, recovery on 'already exists', re-throw on other failures.
- `test/commands/run.test.ts`: 1 new test verifying `--base` reaches `deps.createWorktree`.

### Verification
- `npm run typecheck`: clean.
- `npm run lint`: 10 problems remaining, all pre-existing on main (baseline was 19; auto-fix cleaned 9).
- End-to-end smoke test against a real repo: `bean/test` already-exists → recovered with workspace_id `w17` instead of failing.
- `--base main` smoke test: args observed as `worktree create --json --cwd … --branch bean/hordr-999 --base main`.



## Followup fix (orphan-branch recovery)

### Root cause of the user's follow-up error
First version assumed 'branch already exists' ⇒ 'worktree exists'. Wrong: a
prior failed create can leave the git branch in place without ever linking a
worktree to it. `herdr worktree open --branch X` then fails with
`worktree_not_found`.

### Fix
`src/runtime.ts` now branches on the second failure mode:
1. create fails with 'a branch named X already exists' →
2. try `herdr worktree open`:
   - success → reuse (original case).
   - `worktree_not_found` → branch is orphan → `git branch -d <branch>` and retry create.
   - any other open error → re-throw.
3. `git branch -d` (lowercase `-d`, not `-D`) refuses unmerged or checked-out
   branches — natural safety net against losing real work. The wrapped HerdrError
   surfaces git's reason.

### Added
- `GitRunner` seam in `src/runtime.ts` (`_setGitRunnerForTesting` / `_resetGitRunner`).
- 3 new tests in `test/runtime.test.ts` covering: orphan→delete→retry,
  open-fails-non-not_found→re-throw, git-refuses→propagate.
- defaultGitRunner wraps execFileSync errors into HerdrError with stderr text,
  so users see *why* git refused instead of a generic 'Command failed'.
