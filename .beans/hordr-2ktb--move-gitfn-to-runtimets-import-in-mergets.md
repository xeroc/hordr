---
# hordr-2ktb
title: Move GitFn to runtime.ts, import in merge.ts
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:44:18Z
parent: hordr-xc22
---

1. Ensure runtime.ts exports: `export type GitFn = (args: string[], opts: {cwd: string}) => void`
2. In merge.ts: remove local `export type GitFn`, import from runtime.ts instead.
3. Update any imports of GitFn from merge.ts in other files (broker.ts, etc.) to import from runtime.ts.
4. Delete GitRunner alias if still present — GitFn is the canonical name.

After epic 2, squash.ts and branch.ts are already gone, so only merge.ts needs updating.

## Summary of Changes

- runtime.ts: renamed type `GitRunner` → `GitFn` (canonical export); internal annotations updated. Function names (`getGitRunner`, `_setGitRunnerForTesting`, `_resetGitRunner`) unchanged.
- src/dispatch/merge.ts: removed local `export type GitFn`, now imports `type GitFn` from `../runtime.js`.
- test/dispatch/merge.test.ts: `GitFn` now imported from `../../src/runtime.js`.
- 5 test files (runtime, commands/finish, commands/fleet/{create,abort,finish}): `type GitRunner` → `type GitFn` in imports, annotations, and casts.
- squash.ts and branch.ts retain their own `GitFn` exports (out of scope — scheduled for deletion in epic 2).

Verified: `bun run typecheck` clean, `bun run lint` 0 errors, `bun run test` 264 passing.
