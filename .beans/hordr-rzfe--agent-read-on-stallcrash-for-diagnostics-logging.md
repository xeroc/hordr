---
# hordr-rzfe
title: agent read on stall/crash for diagnostics logging
status: todo
type: task
priority: normal
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-22T08:53:48Z
parent: hordr-zpxz
blocked_by:
    - hordr-gdqm
    - hordr-rzpy
assigned: implementer
---

## Requirement

Use `agent read` to capture agent output when a task stalls or completes, for diagnostics logging and verification. Currently hordr never reads what the agent produced — it only checks bean status + git cleanliness.

## When to read

1. **On `'blocked-interact'`**: read the agent's recent output to capture what approval/input is being requested. Log it so the operator can see what the agent needs without opening the pane.

2. **On `'blocked'` (crash)**: read the last N lines before the pane died (if still available) to capture the error that caused the crash.

3. **On `'proceed'` (task completed)**: optionally read the agent's summary section. Store it in the lane row or log it for audit trail.

## Implementation

Add to `engine.ts` `advanceLane`:

```typescript
if (heal.action === 'blocked-interact') {
  const output = agentRead({name: agentName(lane.epicBeanId, role), source: 'recent-unwrapped', lines: 40})
  logger.warn(`lane ${lane.epicBeanId}: agent blocked. Recent output:\n${output}`)
  // ... existing auto-approve / escalate logic
}
```

On crash recovery:
```typescript
if (heal.action === 'blocked') {
  try {
    const output = agentRead({name: ..., source: 'recent-unwrapped', lines: 40})
    logger.warn(`lane ${lane.epicBeanId}: agent crashed. Last output:\n${output}`)
  } catch { /* pane gone, nothing to read */ }
  // ... existing reset-to-todo logic
}
```

## Alternate-screen caveat

Full-screen agents (Claude Code, OpenCode) render in the alternate screen — `agent read` may return limited output. Document this limitation. The fallback per herdr docs: ask the agent to write its response to a file, read the file. This is a future enhancement, not part of this task.

## Acceptance Criteria

- [ ] On `'blocked-interact'`: `agentRead` captures recent output, logs it at warn level
- [ ] On `'blocked'` (crash): best-effort `agentRead` before reset-to-todo, logs at warn
- [ ] Read failures (pane gone, alternate screen empty) don't crash the engine — wrapped in try/catch
- [ ] `--lines 40` default (configurable later if needed)
- [ ] Log format includes lane epic ID + agent name for traceability
- [ ] Test: mock `agentRead`, verify output is logged on blocked-interact
- [ ] Test: `agentRead` throwing doesn't prevent crash recovery (reset-to-todo still runs)
- [ ] `bun run lint` passes
