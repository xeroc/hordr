---
# hordr-af4d
title: Replace spawnInvocation pane-run with agent-start + agent-prompt
status: todo
type: task
priority: normal
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-22T08:53:48Z
parent: hordr-l6d9
blocked_by:
    - hordr-gdqm
assigned: implementer
---

## Requirement

Replace `spawnInvocation`'s fire-and-forget `pane run` with tracked `agent start` + `agent prompt`. Agents get a stable name (`hordr:<epic-id>:<role>`) and herdr tracks their lifecycle from launch.

## Current behavior (`spawn.ts:139-141`)

```typescript
export function spawnInvocation(opts: {harness: string; paneId: string; prompt: string}): void {
  runInPane(opts.paneId, buildHarnessCommand(opts.harness, opts.prompt))
}
```

This fires a raw shell command into a pane. Herdr detects the agent process after the fact but hordr has no control over the lifecycle.

## New behavior

```typescript
export function spawnInvocation(opts: {
  agentName: string      // e.g. "hordr:hordr-abcd:implementer"
  kind: string           // herdr --kind value (opencode, claude, ...)
  paneId: string
  prompt: string
  harnessArgs?: string[] // extra args passed after --
}): void {
  agentStart({name: opts.agentName, kind: opts.kind, paneId: opts.paneId, args: opts.harnessArgs})
  agentPrompt({name: opts.agentName, prompt: opts.prompt})
}
```

Two-phase: `agentStart` waits until herdr confirms the agent is ready (up to 30s default), then `agentPrompt` submits the bean body. No `--wait` on prompt — dispatch stays non-blocking; the heal check on the next `fleet check` pass monitors lifecycle.

## Changes to callers

### `loop.ts:48` (`dispatchNext`)

The `spawn` dep signature changes: `(harness, prompt) => void` → `(opts: SpawnOpts) => void`. The caller (`engine.ts:426`) provides `agentName` and `kind` from the lane + role config.

### `engine.ts:418-428`

```typescript
spawn: (harness, prompt) => spawnInvocation({
  agentName: agentName(lane.epicBeanId, outcome.role),
  kind: resolveKind(outcome.role, config),  // from AgentDef.kind or derived from harness
  paneId: pane.paneId,
  prompt,
}),
```

## Migration note

`buildHarnessCommand` (`launcher.ts:55-58`) becomes unused after this change — delete it. The harness-specific shell quoting (omp vs opencode/claude) moves into `agentStart`'s `args` parameter, which passes them after `--` to the agent executable unchanged.

## Acceptance Criteria

- [ ] `spawnInvocation` uses `agentStart` + `agentPrompt` instead of `runInPane`
- [ ] Agent name follows convention: `hordr:<epic-bean-id>:<role>`
- [ ] `SpawnOpts` interface updated with `agentName`, `kind`, `harnessArgs?`
- [ ] `dispatchNext` (`loop.ts`) passes the new opts
- [ ] `engine.ts` provides `agentName` and `kind` from lane + config
- [ ] `buildHarnessCommand` deleted (dead code after migration)
- [ ] `resolveHarness` still validates harness is on PATH (keep the check, just don't build the command string)
- [ ] All spawn/dispatch tests updated to mock `agentStart`/`agentPrompt` instead of `runInPane`
- [ ] `bun run lint` passes
