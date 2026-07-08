---
# hordr-nm2o
title: Milestone integration branch lifecycle
status: todo
type: task
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-5m0o
---

At fleet create: create ms/<milestone-id> branch from primary. This is the integration branch where completed epic branches merge into. Lives until fleet finish (where it merges to primary). All epic worktrees branch from this branch.
