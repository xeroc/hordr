---
# hordr-1303
title: Wait helpers and notification
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T15:16:42Z
parent: hordr-1003
---

## Requirement

Block until output appears or an agent reaches a status. Fire herdr notifications on state changes.

## Spec

Create `src/herdr/wait.ts`. Functions: `waitOutput(paneId, pattern, timeoutMs)` → wraps `herdr wait output --regex --timeout`. Returns matched text or throws on timeout. `waitAgentStatus(paneId, status, timeoutMs)` → wraps `herdr wait agent-status`. Create `src/herdr/notify.ts`: `notify(title, body?)` → wraps `herdr notification show`.

## Acceptance Criteria

- [ ] `waitOutput` returns when pattern matches; throws on timeout
- [ ] `waitAgentStatus` returns when status reached; throws on timeout
- [ ] `notify` fires a toast visible in herdr

## Test Plan

Integration: send text to a pane, wait for it, verify match. Start an agent, wait for done, verify. Fire a notification, verify it appears.

## Summary of Changes

- src/herdr/wait.ts: waitOutput (regex/plain, --source/--lines/--timeout), waitAgentStatus (5-status closed enum), HerdrWaitTimeout subclass for timeout-vs-error distinction.
- src/herdr/notify.ts: notify(title, body?, position?, sound?) wrapping herdr notification show.
- Both use _setShellForTesting seam. parseHerdrResult helper handles JSON-RPC envelopes + plain-text fallback.
- 16 tests: happy paths, regex flag, timeout throws HerdrWaitTimeout with pane_id, status enum validation, notify option forwarding, empty-stdout success.
