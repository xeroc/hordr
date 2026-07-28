---
# hordr-rzpy
title: 'engine.ts advanceLane: handle blocked/idle/done lifecycle states'
status: scrapped
type: task
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-gdqm
blocked_by:
    - hordr-cib1
---

## Requirement

Wire the new lifecycle-aware heal into `engine.ts` `advanceLane`. Handle `'blocked-interact'` from `checkInvocation` — the engine decides per-role whether to auto-approve, escalate, or wait.

## Current behavior (`engine.ts:437-487`)

```typescript
const heal = checkInvocation(...)
if (heal.action === 'wait') return {action: 'wait'}
if (heal.action === 'blocked') {
  // crash: reset bean to todo, free lane
  resetBeanToTodo(crashedTaskId)
  ...
  return {action: 'blocked', taskId: crashedTaskId}
}
// proceed: bean completed → rollup, maybe merge, maybe wait for /done
```

## New behavior

Add a `'blocked-interact'` branch between `wait` and `blocked`:

```typescript
if (heal.action === 'blocked-interact') {
  const agent = config.agents[role]
  if (agent?.auto_approve) {
    // auto-dismiss the approval prompt
    agentSendKeys(agentName(lane), 'enter')
    logger.info(`lane ${lane.epicBeanId}: agent blocked, auto-approved`)
    return {action: 'wait'}  // re-check next pass
  }
  // escalate: log + return blocked-interact so fleet status can surface it
  logger.warn(`lane ${lane.epicBeanId}: agent blocked (approval prompt) — manual intervention needed`)
  return {action: 'blocked-interact', taskId: lane.currentTaskBeanId}
}
```

Also: update `LaneAction` type to include `'blocked-interact'`. Update `fleet status` to show lanes in this state distinctly from crashed lanes.

## Design notes

- `auto_approve` defaults to `false` — the engine only escalates by default. This is conservative and respects ADR-0010's spirit ("blocked often means waiting on a prompt the human wants to approve interactively").
- When `auto_approve` is `true`, the engine sends `enter` and returns `wait` — the next `fleet check` pass re-evaluates. No retry loop within a single pass.
- `agentName(lane)` is a helper: `hordr:${lane.epicBeanId}:${currentRole}`. Lives in `agent.ts` or `spawn.ts`.

## Acceptance Criteria

- [ ] `LaneAction` type includes `'blocked-interact'`
- [ ] `advanceLane` handles `heal.action === 'blocked-interact'`
- [ ] When `config.agents[role].auto_approve === true`: calls `agentSendKeys(name, 'enter')`, logs, returns `{action: 'wait'}`
- [ ] When `auto_approve` is falsy: logs warning, returns `{action: 'blocked-interact', taskId}`
- [ ] Existing crash handling (`'blocked'` → reset to todo) unchanged
- [ ] Existing proceed handling (rollup → maybe merge) unchanged
- [ ] `agentName` helper exported and tested
- [ ] Engine tests: mock heal to return `'blocked-interact'`, verify both auto-approve and escalate paths
- [ ] `bun run lint` passes
