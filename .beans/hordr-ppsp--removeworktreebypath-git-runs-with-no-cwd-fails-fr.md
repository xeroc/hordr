---
# hordr-ppsp
title: 'removeWorktreeByPath: git runs with no cwd → fails from non-git dirs (cron)'
status: completed
type: bug
priority: high
created_at: 2026-07-29T10:22:15Z
updated_at: 2026-07-29T10:27:49Z
---

removeWorktreeByPath calls _git(['worktree','remove',path]) with no cwd → defaults to process.cwd(). git worktree remove needs to discover a repo from cwd. When hordr fleet check runs from cron/non-git dir: 'fatal: not a git repository'. Fix: add cwd param, callers pass fleet.worktreePath (engine) or mainRepoCwd (finishFleetTeardown).

## Summary of Changes

**Root cause:** `removeWorktreeByPath` ran `git worktree remove <path>` with no cwd → defaulted to `process.cwd()`. `git worktree remove` discovers the repo from cwd; when hordr runs from cron/$HOME/non-git dir, git can't find a repo → 'fatal: not a git repository'. Worktree removal fails → branch delete fails (worktree still holds the ref) → orphaned ref.

**Fix:**
- `src/herdr/worktree.ts`: `removeWorktreeByPath(worktreePath, opts?: {cwd?: string})` — forwards cwd to `_git`.
- `src/dispatch/engine.ts:329` (mergeEpicLane lane teardown): passes `{cwd: fleet.worktreePath}` (the ms worktree — a valid git repo).
- `src/fleet/lifecycle.ts` (`finishFleetTeardown` + `FinishFleetDeps`): widened `removeWorktree` dep to `(worktreePath, opts?) => void`, calls with `{cwd: opts.mainRepoCwd}` (main repo).
- `src/commands/fleet/finish.ts`: forwards opts through the dep closure.
- `engine.ts:603` (merger-resolution teardown): passes `removeWorktreeByPath` directly — compatible signature, cwd injected by finishFleetTeardown.

**Tests:** +3 (worktree cwd forwarding, finishFleetTeardown passes mainRepoCwd). 328 total pass.
