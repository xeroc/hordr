---
# hordr-4722
title: Self-heal stale workspace in advanceLane pane creation
status: completed
type: bug
priority: high
created_at: 2026-07-17T08:30:15Z
updated_at: 2026-07-17T08:38:52Z
---

When a lane's herdr workspace dies (restart/tmux closed) but the worktree survives on disk, advanceLane feeds the stale workspace_id into herdr tab create → workspace_not_found, swallowed by the per-lane try/catch → lane stuck every tick. resetLane has the same flaw. Extract a pure ensureLanePane helper that catches workspace_not_found and reattaches the worktree via herdr worktree open, then wires it into advanceLane (and resetLane).

## Summary of Changes

- Added pure helper `ensureLanePane` (src/dispatch/pane-heal.ts) with injected deps: fast-path (pane alive), recreate-path (pane dead, workspace alive → new tab), heal-path (workspace dead → `herdr worktree open` reattaches existing worktree to fresh workspace, then create tab).
- Wired into advanceLane (src/dispatch/engine.ts): persists new workspace id via setLaneWorktree on heal, else setLanePane.
- Detection via /`workspace_not_found`/.test(message) — consistent with cleanup.ts/finish.ts/abort.ts; avoids the two-HerdrError-class (pane.ts vs worktree.ts) instanceof landmine.
- Tests: test/dispatch/pane-heal.test.ts (5 cases, all branches). 317 passing, typecheck + lint clean.

Note: resetLane (src/fleet/lifecycle.ts:293-297) shares the same flaw but was left untouched — follow-up bean candidate. The manual recovery applied to the live fleet (tributary-s16v → workspace w86) is unaffected by this code change.
