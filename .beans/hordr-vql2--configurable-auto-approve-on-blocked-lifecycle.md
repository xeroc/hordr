---
# hordr-vql2
title: Configurable auto-approve on blocked lifecycle
status: todo
type: task
priority: normal
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-22T08:53:48Z
parent: hordr-zpxz
blocked_by:
    - hordr-gdqm
    - hordr-rzpy
    - hordr-rzfe
assigned: implementer
---

## Requirement

Wire the `auto_approve` config field (from Epic 1's config task) into the engine's `'blocked-interact'` handler so agents stuck on approval prompts get auto-dismissed when configured.

## Behavior

When `checkInvocation` returns `'blocked-interact'` and `config.agents[role].auto_approve === true`:

1. `agentSendKeys(agentName, 'enter')` — dismiss the approval prompt
2. Log: `lane <epic>: agent blocked, auto-approved`
3. Return `{action: 'wait'}` — next `fleet check` pass re-evaluates

When `auto_approve === false` (default):
1. Log warning with agent output (from diagnostics task)
2. Return `{action: 'blocked-interact', taskId}` — surfaces in fleet status

## Config example

```yaml
hordr:
  agents:
    implementer:
      harness: opencode
      kind: opencode
      auto_approve: true    # auto-dismiss approval prompts
    reviewer:
      harness: opencode
      kind: opencode
      auto_approve: false   # human reviews approvals
```

## Safety

- Only `enter` is sent — never `y` or `yes` or arbitrary text. The approval UI's default action is triggered.
- One auto-approve per `fleet check` pass. If the agent blocks again immediately, the next pass handles it. No tight retry loop.
- If the agent is still `blocked` after 3 consecutive auto-approve attempts across passes, stop auto-approving and escalate (flag in fleet status). This prevents infinite approval loops.

## Acceptance Criteria

- [ ] `auto_approve: true` → engine sends `enter` on `'blocked-interact'`, returns `wait`
- [ ] `auto_approve: false` (default) → engine escalates, returns `'blocked-interact'`
- [ ] Max 3 consecutive auto-approves per lane before escalating (counter in lane row or engine state)
- [ ] Counter resets when the agent transitions out of `blocked` (goes back to `working`)
- [ ] Test: mock config + heal + agentSendKeys, verify enter is sent
- [ ] Test: 4th consecutive blocked → no auto-approve, escalates
- [ ] Test: counter resets after agent returns to working
- [ ] `bun run lint` passes
