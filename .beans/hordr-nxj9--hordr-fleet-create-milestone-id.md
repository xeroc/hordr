---
# hordr-nxj9
title: hordr fleet create <milestone-id>
status: todo
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-t3wf
---

Validate milestone bean (type=milestone, has team/company ref), create worktree milestone/<id> on --base, write fleet row (SQLite, status=active), ensure daemon running (lazy auto-start), start per-fleet loop. Scope all beans calls to the worktree cwd.
