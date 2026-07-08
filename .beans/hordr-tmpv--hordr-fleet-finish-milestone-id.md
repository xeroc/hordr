---
# hordr-tmpv
title: hordr fleet finish <milestone-id>
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-08T08:44:01Z
parent: hordr-t3wf
---

Assert milestone bean status==completed (rollup must have closed it). gitMergeBranch --no-ff milestone/<id> into primary (reuse existing runtime.gitMergeBranch). Tear down worktree + fleet row. Refuse if milestone not complete.



## Per-epic model update (grilling session)

fleet finish now: (1) assert ALL epics are done (merged into milestone branch), (2) assert milestone bean is completed, (3) merge ms/<id> into primary via --no-ff, (4) tear down all remaining worktrees + fleet row. Refuses if any epic is not yet merged.
