---
# hordr-w843
title: hordr fleet abort <milestone-id> [--force]
status: todo
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-08T08:44:01Z
parent: hordr-t3wf
---

Stop the per-fleet loop, keep worktree by default (work preserved for manual inspection). --force also removes the worktree (unmerged work discarded). Keep beans for retry. Delete fleet row.



## Per-epic model update (grilling session)

fleet abort now: stop ALL lane dispatch loops, keep worktrees by default (work preserved), --force removes all epic worktrees + the milestone branch. Delete all lane rows + fleet row.
