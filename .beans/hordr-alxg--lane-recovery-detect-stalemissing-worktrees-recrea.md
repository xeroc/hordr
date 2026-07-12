---
# hordr-alxg
title: 'Lane recovery: detect stale/missing worktrees, recreate or mark done'
status: completed
type: task
priority: critical
created_at: 2026-07-12T19:40:52Z
updated_at: 2026-07-12T19:50:03Z
parent: hordr-uye4
---

When a lane's worktree is gone (user deleted it, crash, etc.), the daemon crashes on beans queries. Fix: before advancing each lane, check if the worktree directory exists. If gone: (1) check epic status from the ms worktree, (2) if completed → mark lane done, (3) if not completed → recreate worktree + pane from ms branch, clear current task, redispatch next tick. Also: wrap each lane advance in its own try/catch so one bad lane doesn't kill the whole tick.

## Summary

- Lane recovery: tick checks worktreeExists before advancing each lane
- Worktree gone + epic completed → mark lane done (skip merge — work is in ms branch)
- Worktree gone + epic not completed → recreate worktree + pane from ms branch, clear task, redispatch next tick
- Per-lane try/catch: one bad lane doesn't kill the whole tick
- Added worktreeExists dep (existsSync in production, mockable in tests)
- Added setLaneWorktree to update worktree_path + workspace_id + pane_id + clear current_task
