---
# hordr-fl2c
title: 'advanceLane: per-lane dispatch-or-heal step'
status: completed
type: task
priority: high
created_at: 2026-07-09T09:40:40Z
updated_at: 2026-07-09T09:53:00Z
parent: hordr-7hpb
---

Pure function advanceLane(lane, fleet, config, deps): if lane has no currentTask -> dispatchNext (getDispatchable(epicId) -> spawn), record invocation + setLaneCurrentTask. If active -> checkInvocation: proceed (bean completed) -> rollup(task) + if epic completed -> mergeBranch(lane->ms) + lane->done + removeWorktree + (if allEpicsCompleted -> mark milestone complete); blocked -> surface lane; wait -> no-op. Injectable deps. Tests cover dispatch, wait, proceed-with-epic-merge, blocked.

## Summary of Changes

- `src/dispatch/advance.ts`: `advanceLane` — one lane, one step: idle→dispatchNext+setLaneCurrentTask; active→checkInvocation (wait/blocked/proceed); proceed→rollup, and if epic completed→mergeBranch(lane→ms)+removeWorktree+lane done; merge conflict or crashed pane→lane 'conflict' (human-needed)
- `src/storage/fleets.ts`: `setLaneCurrentTask`
- Tests: idle+dispatch, idle+no-work, wait, blocked(crash), proceed-epic-open (frees lane), proceed-epic-completed (merge+teardown+done), merge-conflict (keeps worktree)

Reuses dispatchNext, checkInvocation, rollup, mergeBranch. Invocation-row recording deferred (ponytail: currentTask is the operative state).
