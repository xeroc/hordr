---
# hordr-92m9
title: 'New generic agent step handler: spawn + wait-for-done-or-blocked'
status: todo
type: task
priority: critical
created_at: 2026-06-27T12:56:55Z
updated_at: 2026-06-27T12:56:55Z
parent: hordr-rt1e
---

## Requirement

Replace all deleted agent-type handlers with one generic `agent` step handler.

## Spec

Create src/engine/steps/agent.ts. Signature: same StepHandler type.

Behavior:
1. Resolve role from step.agent (required — no default role map).
2. Launch or reuse agent pane via deps.launchAgent (same launchOrReuse helper from shared.ts).
3. Wait for agent to signal done OR blocked via deps.waitForAgentDone.
   - Current waitForAgentDone waits for done only. Extend to wait for done-or-blocked.
   - Returns 'done' | 'blocked'. On done → advance. On blocked → run blocks.
4. No output parsing. No signal detection. No status-specific logic.

Step config in workflow YAML: just `agent: <role>`. No kind, no pane, no wait, no optional.

Update src/engine/steps/shared.ts: keep launchOrReuse (still needed). Delete DEFAULT_ROLE map (roles are explicit in config now).

Update src/engine/steps/index.ts: add `agent` to STEP_HANDLERS map.

Update EngineDeps.waitForAgentDone signature to return 'done' | 'blocked' instead of void. Update runtime.ts implementation to poll/wait for either status.

## Acceptance Criteria

- [ ] agent handler spawns agent + waits for done-or-blocked
- [ ] done → {done: true}; blocked → {done: false, block: true, runPatch: {status: 'blocked'}}
- [ ] No output parsing, no signal detection
- [ ] STEP_HANDLERS map has exactly 2 entries: agent + hitl
- [ ] Tests for both outcomes (done advance, blocked blocks)

## Test Plan

Unit test with mock deps: launchAgent returns pane, waitForAgentDone returns 'done' → advance. Returns 'blocked' → run blocks. Idempotency: existing pane reused.
