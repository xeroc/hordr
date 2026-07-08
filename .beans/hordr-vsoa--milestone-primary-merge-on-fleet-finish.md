---
# hordr-vsoa
title: Milestone → primary merge on fleet finish
status: completed
type: task
priority: high
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T09:17:24Z
parent: hordr-5m0o
---

When ALL epics are done (merged into milestone branch): merge ms/<milestone-id> into primary via gitMergeBranch --no-ff. This is the final integration — the milestone branch carries all the work. Reuse existing runtime.gitMergeBranch.

## Summary of Changes

- Added mergeMilestoneToPrimary to src/dispatch/merge.ts
- Thin wrapper: mergeBranch(primary, ms/<id>, cwd, git) — reuses the same checkout + merge --no-ff logic
- Called at fleet finish to merge the milestone integration branch back to primary
