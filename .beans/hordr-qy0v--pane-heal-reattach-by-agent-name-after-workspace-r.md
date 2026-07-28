---
# hordr-qy0v
title: 'pane-heal: reattach by agent name after workspace recovery'
status: todo
type: task
priority: normal
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-22T08:53:48Z
parent: hordr-l6d9
blocked_by:
    - hordr-af4d
assigned: implementer
---

## Requirement

Update `pane-heal.ts` (`ensureLanePane`) to reattach to agents by name after workspace/pane recovery, not just recreate a bare pane. When a pane dies and is recreated, the agent name must be re-registered so lifecycle queries work.

## Current behavior (`pane-heal.ts:54-72`)

Three paths:
1. Pane alive → reuse it
2. Pane gone, workspace alive → `createTab` in stored workspace
3. Workspace gone → `openWorktree` (reattach to fresh workspace) + `createTab`

After recreation, the lane has a new pane but no agent running. The next `advanceLane` dispatches a fresh invocation via `spawnInvocation`.

## New behavior

After pane recreation, the engine's next dispatch calls `agentStart` with the lane's stable agent name. No change to `ensureLanePane` itself — but the name must be derivable from the lane, not from the pane.

Add `agentName(epicId, role)` helper to `spawn.ts` (or `agent.ts`):

```typescript
export function agentName(epicBeanId: string, role: string): string {
  return `hordr:${epicBeanId}:${role}`
}
```

This name is stable across pane recreations. When `agentStart` is called with a name that's already live (stale from a dead pane), herdr clears the old alias automatically ("The alias is cleared when that agent exits, is released, or is replaced" — per herdr docs).

## What changes

- `ensureLanePane` itself doesn't change — it manages panes, not agents.
- The change is in the **callers**: `engine.ts` and `spawnInvocation` use `agentName(lane.epicBeanId, role)` instead of constructing a name ad-hoc.
- Add a test: pane dies → recreated → `agentStart` with same name succeeds (herdr auto-clears stale alias).

## Acceptance Criteria

- [ ] `agentName(epicBeanId, role)` helper exported from `spawn.ts` or `agent.ts`
- [ ] Name format: `hordr:<epic-bean-id>:<role>` (e.g., `hordr:hordr-abcd:implementer`)
- [ ] Name matches `[a-z][a-z0-9_-]{0,31}` constraint from herdr (bean IDs are lowercase alphanumeric + hyphens — verify length fits)
- [ ] `ensureLanePane` callers use `agentName` consistently (no ad-hoc name construction)
- [ ] Test: pane recreation + re-dispatch uses the same agent name
- [ ] Test: stale agent name (from dead pane) doesn't block `agentStart` (herdr auto-clears)
- [ ] `bun run lint` passes
