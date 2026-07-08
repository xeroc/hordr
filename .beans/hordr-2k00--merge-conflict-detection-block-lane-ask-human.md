---
# hordr-2k00
title: Merge-conflict detection → block lane, ask human
status: todo
type: task
priority: high
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-5m0o
---

If the epic→milestone merge conflicts: set lane status to conflict, surface in fleet status with the conflicted files. The human resolves manually in the epic worktree (git status, edit, git add, git commit). The daemon's next tick detects the resolved merge and proceeds. Do NOT auto-resolve with an agent — conflicts need human judgment.
