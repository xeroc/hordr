---
# hordr-cib1
title: 'heal.ts: replace binary agentActiveInPane with lifecycle-aware probe'
status: scrapped
type: task
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-gdqm
blocked_by:
    - hordr-ngs8
---

## Requirement

Replace the binary `agentActiveInPane` health check in `heal.ts` with a lifecycle-aware probe using the new `agent.ts` wrapper. The heal decision matrix expands from 3 states to 6.

## Current behavior (`heal.ts:41-56`)

```
bean completed + worktree clean → proceed
bean completed + worktree dirty  → wait
pane gone + bean not completed    → blocked (crash)
otherwise                         → wait
```

`agentActiveInPane` (`pane.ts:134-140`) checks `pane.agent !== undefined` — binary alive/dead. It ignores `agent_status` even though `PaneListEntry` already declares it (`pane.ts:100`).

## New behavior

Add `agentLifecycle` to `HealDeps`:

```typescript
export interface HealDeps {
  agentLifecycle: (paneId: string) => LifecycleState  // NEW
  beanStatus: (taskId: string) => string | undefined
  paneAlive: (paneId: string) => boolean
  worktreeClean: (worktreePath: string) => boolean
}
```

New `HealResult.action` values: add `'blocked-interact'` alongside existing `'blocked' | 'proceed' | 'wait'`.

```
bean completed + clean            → proceed
bean completed + dirty            → wait
agent gone + bean not completed   → blocked (crash, same as before)
agent blocked + bean not completed → blocked-interact (NEW: approval prompt)
agent done/idle + bean not completed → wait (phantom: agent finished without /done)
agent working + bean not completed   → wait (confirmed working)
```

`'blocked'` keeps its current meaning (crash → reset to todo). `'blocked-interact'` is the new state for agents waiting on approval/input — the engine decides what to do (auto-approve, escalate, log).

## Acceptance Criteria

- [ ] `HealDeps` has `agentLifecycle: (paneId: string) => LifecycleState`
- [ ] `HealResult.action` includes `'blocked-interact'`
- [ ] `checkInvocation` queries `deps.agentLifecycle` when bean is not completed and pane is alive
- [ ] Agent `blocked` → returns `{action: 'blocked-interact', reason: 'agent blocked (approval/input prompt)'}`
- [ ] Agent `done`/`idle` + bean not completed → returns `{action: 'wait', reason: 'agent idle/done but bean not completed (phantom or missed /done)'}`
- [ ] Agent `working` → returns `{action: 'wait', reason: 'agent working'}`
- [ ] Agent `gone` (no agent in pane) → returns `{action: 'blocked', reason: 'pane gone without completion (crash)'}` (existing behavior preserved)
- [ ] `worktreeIsClean` pure function unchanged (no regression)
- [ ] All existing heal tests updated with mocked `agentLifecycle` dep
- [ ] New tests: each lifecycle state produces the correct action
- [ ] `bun run lint` passes
