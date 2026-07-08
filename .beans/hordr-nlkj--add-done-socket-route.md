---
# hordr-nlkj
title: Add /done socket route
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:19:49Z
parent: hordr-ikft
---

POST /done {project, task_id}. Handler: verify bean status==completed (beans show --cwd worktree), verify HEAD commit exists, trigger rollup (ADR-0011), check milestone completion, dispatch next. Reject if bean not actually completed (member lied).

## Summary of Changes

- src/dispatch/done.ts: handleDone(body, deps) — validates task_id, verifies completion via injected deps
- Returns 200 on success, 400 on missing task_id, 409 on bean-not-completed (member lied/forgot)
- Pure function — daemon wires verifyCompleted to call beans show --cwd worktree
- test/dispatch/done.test.ts: 5 tests
