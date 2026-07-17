---
# hordr-thjh
title: In-place lane continuation via hordr done
status: completed
type: task
priority: high
created_at: 2026-07-16T13:34:04Z
updated_at: 2026-07-16T13:49:40Z
parent: hordr-4j5j
---

## Requirement

When an agent calls `hordr done <task>`, the daemon returns the next dispatchable bean in the lane epic. The agent continues in-place — same session, same context window — adopting the next bean role/persona. Eliminates the fragile send-keys spawn for sequential dispatch.

## Design (grilled + confirmed)

- `hordr done` becomes the authority for sequential dispatch (not the tick)
- Assumed acceptance: `/done` atomically sets `currentTaskBeanId` to the next bean before responding
- Whole lane = one context window (first task to epic merge)
- Tick yields sequential dispatch to `/done`; retains cold-start + crash recovery (pane-gone)
- Pane-close = human escape hatch (tick detects pane-gone, crash-recovers)
- Harness mismatch: `/done` returns `next: null`, tick cold-starts with correct harness

## Acceptance Criteria

- [x] `src/dispatch/continue.ts` — pure continuation logic with injected deps
- [x] `handleDone` returns `{ok, task_id, next: {id, role, prompt} | null}`
- [x] Tick heal-completed path: pane alive → wait (dont free); pane gone → crash recovery (free + dispatch)
- [x] `hordr done` CLI prints response JSON to stdout
- [x] Spawn prompt: "Then stop" → continuation instructions
- [x] Harness mismatch returns next:null
- [x] All existing tests pass
- [x] New tests for continuation: happy path, no-next-bean, harness-mismatch, no-lane
- [x] New tests for tick pane-alive gate
- [x] Lint clean, build green

## Summary of Changes

### New module: `src/dispatch/continue.ts`
Pure continuation logic with injected deps. After /done verifies a task, finds the next dispatchable bean in the lane's epic, resolves its role/persona, checks harness compatibility, and returns the full invocation prompt for the agent to adopt in-place.

### Modified: `src/dispatch/done.ts`
`handleDone` now calls `continue(taskId)` after verification passes. Response shape: `{ok, task_id, next: {id, role, prompt} | null}`. The agent reads `next` from the JSON and either continues (persona switch) or stops.

### Modified: tick heal-completed path (`advance.ts` + `engine.ts`)
When heal detects bean-completed + worktree-clean:
- **Pane alive** → return `wait`, DON'T free the lane. The agent will call `/done` which owns continuation.
- **Pane gone** → crash recovery: free lane, next tick dispatches via spawn (cold-start).

This eliminates the fragile send-keys spawn for sequential dispatch. Closing the pane tab = human escape hatch.

### Modified: `src/dispatch/spawn.ts` prompt
`Then stop` replaced with continuation instructions: `hordr done` returns JSON with `next` — adopt the persona and keep working, or stop if null.

### Modified: `src/commands/done.ts` CLI
Now prints the daemon response JSON to stdout so the agent can parse `next`.

### Modified: `src/daemon/broker.ts` + `src/commands/daemon.ts`
`wireDaemon` passes `continue` dep (backed by `engine.continueTask`) to the /done route handler. Added `continueTask(db, taskId)` to FleetEngine interface.

### Tests (308 passing, 0 failing)
- `test/dispatch/continue.test.ts` — 7 tests: happy path, rollup, atomic claim, no-lane, no-dispatchable, harness-mismatch, role-switch
- `test/dispatch/done.test.ts` — 12 tests: updated for new response shape + continuation integration
- `test/dispatch/advance.test.ts` — split proceed test into pane-alive (dont free) + pane-gone (crash recovery)
- `test/daemon/broker.test.ts` — updated doneRouteHandler for new {continue, verify} signature
