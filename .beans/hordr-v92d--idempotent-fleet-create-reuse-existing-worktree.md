---
# hordr-v92d
title: 'Idempotent fleet create: reuse existing worktree'
status: completed
type: task
priority: normal
created_at: 2026-07-15T14:30:24Z
updated_at: 2026-07-15T14:41:53Z
---

Wrap createWorktree in createFleet with openWorktree fallback so re-running fleet create after a partial failure doesn't crash on 'already exists'.

## Summary of Changes

- Added `openWorktree` to `CreateFleetDeps` interface.
- Wrapped `createWorktree` in `createFleet` with try/catch — falls back to `openWorktree` on 'already exists'.
- Updated `create.ts` command to wire `openWorktree` dep.
- TDD: 1 unit test for the fallback path.
