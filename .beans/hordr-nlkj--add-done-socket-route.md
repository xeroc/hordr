---
# hordr-nlkj
title: Add /done socket route
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-ikft
---

POST /done {project, task_id}. Handler: verify bean status==completed (beans show --cwd worktree), verify HEAD commit exists, trigger rollup (ADR-0011), check milestone completion, dispatch next. Reject if bean not actually completed (member lied).
