---
# hordr-ku70
title: Ancestry walk + subtree-completion check via beans query
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:24:04Z
parent: hordr-nj9r
---

After /done, beans query the task's parent chain (and each ancestor's full subtree). For each ancestor: if all descendants status==completed, mark it completed via beans update --cwd worktree. Stop at the first ancestor with open descendants. Uniform for all non-leaf types (epic/feature/milestone) — no per-type logic.

## Summary of Changes

- src/dispatch/rollup.ts: rollup(taskId, deps) — ancestry walk + status propagation
- Walks the task's ancestor chain (nearest first), marks each ancestor completed when all descendants completed, stops at first incomplete
- Uniform for all non-leaf types (epic/feature/milestone) — no per-type logic
- Pure function with injected deps (fetchAncestry, markCompleted)
- test/dispatch/rollup.test.ts: 5 tests (all-complete, partial, immediate-open, no-ancestors, single-milestone)
