---
# hordr-ngs8
title: Create src/herdr/agent.ts wrapper (agent start/prompt/wait/read/send-keys/get)
status: scrapped
type: task
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-gdqm
---

## Requirement

Create `src/herdr/agent.ts` — a thin synchronous wrapper around `herdr agent` subcommands, mirroring the seam pattern in `pane.ts` and `worktree.ts`.

## Functions to implement

- `agentStart(opts: {name, kind, paneId, args?}): AgentInfo` — wraps `herdr agent start <name> --kind <kind> --pane <paneId> -- <args>`
- `agentPrompt(opts: {name, prompt, wait?, until?, timeout?}): AgentInfo` — wraps `herdr agent prompt <name> "<prompt>"` with optional `--wait --until <state> --timeout <ms>`
- `agentWait(opts: {name, until?, timeout?}): AgentInfo` — wraps `herdr agent wait <name> --until <state> --timeout <ms>`
- `agentRead(opts: {name, source?, lines?, format?}): string` — wraps `herdr agent read <name> --source <src> --lines <N>`
- `agentSendKeys(name: string, keys: string): void` — wraps `herdr agent send-keys <name> <keys>`
- `agentGet(nameOrPaneId: string): AgentInfo` — wraps `herdr agent get <nameOrPaneId>`
- `agentStatus(paneId: string): LifecycleState` — convenience: `agentGet` → extract `.status` field. Returns `'gone'` if agent not found (distinct from `'unknown'`).

## Types

```typescript
export type LifecycleState = 'working' | 'blocked' | 'done' | 'idle' | 'unknown' | 'gone'
export interface AgentInfo {
  name?: string
  pane_id: string
  status: LifecycleState
  kind?: string
}
```

## Implementation notes

- Same `ShellFn` test seam as `pane.ts`: `execFileSync(HERDR_BIN, args)` with `_setShellForTesting` / `_resetShell`.
- Parse the JSON envelope: `{result: {agent: {...}}}` for start/prompt/wait, `{result: {read: {text}}}` for read.
- `agentGet` returns `{result: {agent: {...}}}` or `{error: {code: 'agent_not_found'}}`.
- `HERDR_BIN` from `process.env.HERDR_BIN_PATH ?? 'herdr'` — same as pane.ts.
- All functions are synchronous (hordr is a CLI, not a server — same rationale as worktree.ts).

## Acceptance Criteria

- [ ] `src/herdr/agent.ts` exists with all 7 functions exported
- [ ] `ShellFn` test seam with `_setShellForTesting` / `_resetShell` (same pattern as pane.ts)
- [ ] `LifecycleState` type exported with all 6 states
- [ ] `AgentInfo` interface exported
- [ ] `agentStatus` returns `'gone'` (not `'unknown'`) when agent not found in pane — callers must distinguish "no agent" from "agent present but unclassified"
- [ ] Unit tests: mock shell, verify correct herdr args for each function
- [ ] Unit tests: JSON envelope parsing for success + error responses
- [ ] `bun run lint` passes
