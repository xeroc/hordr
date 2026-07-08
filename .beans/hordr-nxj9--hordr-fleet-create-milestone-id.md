---
# hordr-nxj9
title: hordr fleet create <milestone-id>
status: todo
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-08T08:44:01Z
parent: hordr-t3wf
---

Validate milestone bean (type=milestone, has team/company ref), create worktree milestone/<id> on --base, write fleet row (SQLite, status=active), ensure daemon running (lazy auto-start), start per-fleet loop. Scope all beans calls to the worktree cwd.



## Per-epic model update (grilling session)

fleet create now: (1) creates milestone integration branch ms/<id> from primary, (2) scans for unblocked epics under the milestone, (3) creates lanes (worktrees) for each unblocked epic, (4) starts the daemon with per-lane dispatch loops. Does NOT create one shared worktree — that was the old serialized model.
