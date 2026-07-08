---
# hordr-crfl
title: Epic → milestone merge on epic-complete
status: todo
type: task
priority: high
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-5m0o
---

When a lane's epic completes (all tasks done + rolled up to epic level): merge the epic branch into the milestone integration branch (ms/<ms-id>) via gitMergeBranch --no-ff. On success: teardown the epic worktree, mark lane done. Re-scan for newly-unblocked epics on next tick.
