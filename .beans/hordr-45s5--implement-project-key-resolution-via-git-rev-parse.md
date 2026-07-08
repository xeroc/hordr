---
# hordr-45s5
title: Implement project-key resolution via git rev-parse --git-common-dir
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:54:52Z
parent: hordr-plce
---

CLI helper that resolves the project key from cwd by shelling out to git rev-parse --git-common-dir. Must be stable across worktrees of one clone and differ across clones (verify in tests). Used by every CLI command to scope daemon messages.

## Summary of Changes

- src/storage/project.ts: resolveProjectKey({cwd?}) — shells out to git rev-parse --git-common-dir, resolves to absolute path
- Stable across worktrees (shared common dir), differs across clones/repos — the routing key for the daemon
- test/storage/project.test.ts: integration test against the real repo
