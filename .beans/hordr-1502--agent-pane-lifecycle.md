---
# hordr-1502
title: Agent pane lifecycle (spawn, wait done, read output)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1005
order: E2
---

## Requirement

Manage the full lifecycle of an agent pane: spawn in the right cwd, wait for the harness to signal done, and read its output.

## Spec

Extend `src/harness/launcher.ts`. `waitForAgentDone(paneId, timeoutMs)` → wraps `herdr wait agent-status <pane> --status done`. `readAgentOutput(paneId, lines)` → wraps `herdr pane read --source recent`. The implementer pane runs in the worktree root cwd. The tester pane runs in a sibling split.

## Acceptance Criteria

- [ ] Agent pane spawns in the worktree's cwd
- [ ] `waitForAgentDone` returns when the harness reaches `done`
- [ ] `waitForAgentDone` throws on timeout with the pane id
- [ ] Sibling pane (tester) is split from the implementer pane

## Test Plan

Integration: spawn a harness (echo script as fake agent), wait for done, read output. Verify cwd is correct.
