---
# hordr-ph01
title: finishFleet must tear down ms worktree after merge
status: in-progress
type: bug
priority: high
created_at: 2026-07-15T13:28:02Z
updated_at: 2026-07-15T13:37:34Z
---

finishFleet merges ms/<id> into primary but never removes the milestone worktree (fleet.worktreePath). Only abortFleet --force cleans it. Lane worktrees are torn down by the tick (correct), but the ms worktree leaks on a successful finish.

## Acceptance Criteria
- [ ] RED: test asserting finishFleet calls removeWorktree(fleet.branch) after a successful merge
- [ ] GREEN: add removeWorktree to FinishFleetDeps, call it post-merge
- [ ] Wire dep in commands/fleet/finish.ts (removeWorktreeByBranch, main cwd closure — mirror abort)
- [ ] Existing finishFleet tests pass + new test passes
- [x] lint + typecheck clean

## Summary of Changes

- FinishFleetDeps: added required removeWorktree(branch) dep (lifecycle.ts).
- finishFleet: calls removeWorktree(fleet.branch) after a successful ms→primary merge, before deleting rows — closes the ms worktree leak.
- commands/fleet/finish.ts: wires removeWorktree to the shared removeWorktreeByBranch(branch, process.cwd()) helper (mirrors abort).
- herdr/worktree.removeWorktreeByBranch: broadened tolerance to also swallow not_git_worktree (both that and worktree_not_found mean "nothing to remove") so finish is robust when the worktree is already gone / in a non-worktree cwd.
- TDD: RED test first, then implementation. 263 passing, 1 pre-existing unrelated failure (commands/run — bean/ prefix rename).
