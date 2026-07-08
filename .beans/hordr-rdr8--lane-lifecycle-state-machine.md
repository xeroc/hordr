---
# hordr-rdr8
title: Lane lifecycle state machine
status: todo
type: task
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-uye4
---

pending (epic blocked, no worktree) → active (worktree created, dispatching) → merging (epic done, merging to milestone) → conflict (merge conflict, human needed) | done (merged, worktree removed). State transitions driven by the tick handler.
