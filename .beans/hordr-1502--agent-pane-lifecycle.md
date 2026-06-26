---
# hordr-1502
title: Agent pane lifecycle (spawn, wait done, read output)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:21:28Z
parent: hordr-1005
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

## Summary of Changes

- Extended src/harness/launcher.ts: waitForAgentDone(paneLabel, timeoutMs), readAgentOutput(paneLabel, lines=200), splitSiblingPane({parentLabel, newLabel, cwd}).
- waitForAgentDone: single blocking herdr wait agent-status <pane> --status done --timeout <ms>; throws HarnessError('agent <pane> did not reach done within <ms>ms') on timeout.
- readAgentOutput: wraps herdr pane read --source recent --lines <n>.
- splitSiblingPane: herdr pane split --parent <parentLabel> --label <newLabel> --cwd. Returns {paneLabel: newLabel}.
- All sync, all use _herdr seam for testability.
- KNOWN LIMITATION (flagged for hordr-1003): real herdr addresses panes by pane_id not label; pane list/get do not surface labels. Label-based addressing implemented as documented best-guess; real label<->pane_id resolution deferred to hordr-1003 (herdr client layer).
