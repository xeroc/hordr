---
# hordr-nm2o
title: Milestone integration branch lifecycle
status: completed
type: task
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T09:07:07Z
parent: hordr-5m0o
---

At fleet create: create ms/<milestone-id> branch from primary. This is the integration branch where completed epic branches merge into. Lives until fleet finish (where it merges to primary). All epic worktrees branch from this branch.

## Summary of Changes

- src/dispatch/branch.ts: milestoneBranchName(id) → ms/<id> + createMilestoneBranch(opts, deps)
- git branch ms/<milestone-id> <primary> — single command, creates the integration branch
- Epic worktrees branch from this; epic branches merge into it; fleet finish merges it to primary
- test/dispatch/branch.test.ts: 3 tests (naming, create from develop, create from main)
