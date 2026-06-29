---
# hordr-zxgv
title: Persist worktree.path so agent launches inside the worktree
status: completed
type: bug
priority: critical
created_at: 2026-06-29T18:46:54Z
updated_at: 2026-06-29T18:57:20Z
---

createWorktree returns path from herdr but runtime.ts + commands/run.ts + engine/types.WorktreeInfo all drop it. As a result launchOrReuse falls back to workspaceId as cwd and the agent launches in the wrong directory.



## Plan

- [ ] RED: test that runtime.createWorktree returns path, and that run.ts persists it
- [ ] GREEN: add path to engine/types.WorktreeInfo
- [ ] GREEN: include path in runtime.createWorktree return
- [ ] GREEN: write path into run state in commands/run.ts
- [x] full suite + lint + typecheck (134 passing, baseline lint, no regressions)



## Summary of Changes

### Root cause
`createWorktree` returned `path` from herdr's response, but three layers
up the stack silently dropped it:
- `src/engine/types.ts` `WorktreeInfo` had no `path` field.
- `src/runtime.ts` `createEngineDeps.createWorktree` returned only `{branch, workspaceId}`.
- `src/commands/run.ts` wrote run state with only `{branch, workspace_id}`.

So `run.worktree?.path` was always `undefined`, and `launchOrReuse`
(`src/engine/steps/shared.ts:28`) fell back to `workspaceId` (e.g. `'w19'`)
as cwd. The pane was created with a bogus cwd, and the harness/agent ran in
the wrong directory.

### Fix (3 lines of real change)
- `src/engine/types.ts` — added `path?: string` to `WorktreeInfo`.
- `src/runtime.ts` — `createWorktree` returns `{branch, path, workspaceId}` in all three return paths (create / open / delete-and-retry).
- `src/commands/run.ts` — `putRun` includes `path: wt.path` when writing the worktree block.

### Tests (+1, 0 regressions)
- `test/runtime.test.ts`: updated 3 existing assertions to expect `path` in the returned object.
- `test/commands/run.test.ts`: new test verifying (a) run state has `worktree.path`, (b) the agent's `launchAgent` cwd equals the worktree path (not the workspace id).

### Verification
End-to-end against a real repo: pane cwd confirmed as
`/home/xeroc/.herdr/worktrees/wt-test3/bean-wt-test3-yt6w` for both the worktree
tab and the spawned agent pane. Agent now launches inside the worktree.

### Skipped
- Refreshing the local `run` variable after `putRun` in commands/run.ts:
  `enqueue()` reads from the store directly, so the local var is unused after
  the worktree block. (YAGNI.)
