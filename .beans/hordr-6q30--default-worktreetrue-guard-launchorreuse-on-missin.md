---
# hordr-6q30
title: Default worktree=true + guard launchOrReuse on missing worktree
status: completed
type: bug
priority: critical
created_at: 2026-06-29T19:09:44Z
updated_at: 2026-06-29T19:23:36Z
---

Schema defaults worktree to false, so workflows missing the key silently launch agents with cwd=bean-id (broken). Flip default to true. Also guard launchOrReuse so a missing worktree produces a clear StepError instead of workspace_not_found from herdr.



## Plan

- [ ] RED: schema defaults worktree=true; launchOrReuse throws clear error when worktree missing
- [ ] GREEN: flip default in src/config/schema.ts
- [ ] GREEN: guard in src/engine/steps/shared.ts
- [x] full suite + lint + typecheck (136 passing, baseline lint, no regressions)



## Summary of Changes

### Why
`worktree: true` defaulted to `false` in the schema, so any workflow missing
the key silently launched agents with `cwd = bean-id` (the broken fallback in
`launchOrReuse`). Herdr would then fail with `workspace_not_found`.

### Fix
- `src/config/schema.ts` — flipped `worktree` default from `false` to `true`.
  Non-coding workflows opt OUT with `worktree: false`.
- `src/engine/steps/shared.ts` — `launchOrReuse` now throws a clear `StepError`
  (`no worktree for bean X (workflow 'Y' must set worktree: true)`) instead of
  silently falling back to `workspaceId = run.bean` and letting herdr reject.

### Tests
- `test/engine/steps/shared.test.ts` (new) — covers both the guard and the
  happy path (worktree present → cwd/path used correctly).
- Updated `test/engine/helpers.ts` `makeRun` default to include a worktree,
  so existing engine tests aren't flagged by the new guard.

### Note
This bug was discovered while investigating a user report (`hordr run
tributary-20n1` → `workspace_not_found`). The investigation triggered a
broader architectural realization (one-worktree-per-run model — see follow-up
bean), but this specific fix is independently correct and worth shipping
regardless.
