---
# hordr-tmpv
title: hordr fleet finish <milestone-id>
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-t3wf
---

Assert milestone bean status==completed (rollup must have closed it). gitMergeBranch --no-ff milestone/<id> into primary (reuse existing runtime.gitMergeBranch). Tear down worktree + fleet row. Refuse if milestone not complete.
