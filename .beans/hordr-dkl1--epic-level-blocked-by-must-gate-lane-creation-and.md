---
# hordr-dkl1
title: Epic-level blocked_by must gate lane creation and dispatch
status: completed
type: task
priority: normal
created_at: 2026-09-27T08:59:16Z
updated_at: 2026-09-27T09:10:30Z
---

beans --ready does NOT propagate an epic's own blocked_by to its child tasks, and scanForNewLanes only checks hasReadyWork (any one ready task). A cross-epic-blocked epic therefore gets a worktree + dispatches clean tasks before its blocker epic merged (riprap-34q1: wxs8 lane born off n8cx while 6so0 waited on r8wf). Gate scanForNewLanes, the stale-done lane cleanup, and advanceLane dispatch on the epic's own blockers being completed (view-local); let refreshLaneIfStale pull ms in when the lane view is stale-blocked.

## Acceptance Criteria

- [x] scanForNewLanes excludes epics whose own blocked_by has non-completed blockers (even with ready work)
- [x] scanFleet wiring + stale-done lane cleanup respect the epic-level gate (ms view)
- [x] advanceLane does not dispatch while the epic is blocked in the lane view
- [x] a stale-blocked lane refreshes from ms (integrateHead) once ms is unblocked, then dispatches
- [x] existing engine/scan tests stay green; lint + typecheck clean

## Summary of Changes

- `src/dispatch/scan.ts`: `ScanDeps` grows a required `epicBlockersSatisfied`; `scanForNewLanes` filters blocked epics out of lane creation.
- `src/dispatch/engine.ts`: new `epicUnblocked(epicId, cwd)` helper (fetchDependencyStatus → every blocker completed, view-local). Wired into: (1) the scanFleet scan deps + per-epic debug log, (2) the stale-done lane-recreate guard, (3) the advanceLane idle entry + post-refresh re-check — a blocked epic is treated like an empty one so the existing hordr-lcsi refresh pulls ms (blocker completion + code) in before dispatch resumes.
- Tests: 3 new scan cases (phantom-ready), 5 new engine cases (no lane for blocked epic, no stale-done recreate, gated dispatch, gate-open control, stale-blocked refresh → integrateHead(ms) → dispatch). Full suite 456 passing; tsc + eslint clean (0 errors).

Verified behavior contract: a lane is only created/dispatched when the epic's own `--blocked-by` set is completed in the consulted view (ms view for creation, lane view for dispatch).
