---
# hordr-ohgl
title: 'fleet status: show agent lifecycle state per lane'
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

Show agent lifecycle state (`working`/`blocked`/`done`/`idle`/`unknown`) per lane in `hordr fleet status`. Currently the status command shows lane status (active/done/etc.) and current task — but not what the agent is doing right now.

## Current behavior

`fleet status` (`commands/fleet/status.ts`) reads lane rows from SQLite and bean status from the worktree. It does NOT query agent lifecycle — it can't, because `agentActiveInPane` is binary.

## New behavior

For each active lane with a `currentTaskBeanId`, query the agent lifecycle:

```typescript
const lifecycle = agentStatus(lane.paneId)  // 'working' | 'blocked' | 'done' | 'idle' | 'unknown' | 'gone'
```

Display it alongside the existing lane info:

```
Lane  hordr-abcd  [active]  task=hordr-1234  agent=working
Lane  hordr-efgh  [active]  task=hordr-5678  agent=blocked ← approval prompt
Lane  hordr-ijkl  [done]
```

Color-code or flag `blocked` lanes distinctly — they need attention.

## Acceptance Criteria

- [ ] `fleet status` queries `agentStatus(paneId)` for each active lane
- [ ] Display includes agent lifecycle state per active lane
- [ ] `blocked` lanes visually distinct (warning indicator)
- [ ] `gone` shown as `crashed` or `no-agent` for clarity
- [ ] Graceful degradation: if `agentStatus` fails (herdr error), show `?` and don't crash status
- [ ] Test: mock `agentStatus`, verify display for each lifecycle state
- [ ] `bun run lint` passes
