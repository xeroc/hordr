---
# hordr-vouv
title: hordr agent lifecycle integration
status: scrapped
type: milestone
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
---

Integrate herdr's new agent automation API into hordr's dispatch core. Hordr currently uses herdr as a dumb terminal multiplexer — `pane run` to fire raw shell commands, `pane list` to binary-check if an agent field exists. The new herdr agent primitives (`agent start`, `agent prompt`, `agent wait --until`, `agent read`, `agent send-keys`) give hordr first-class agent lifecycle control: named tracked agents, lifecycle states (working/blocked/done/idle/unknown), output reading, and UI interaction.

## Problem

The heal logic (`heal.ts:41-56`) can only distinguish three cases: bean-completed+clean → proceed, pane-gone → crash, otherwise → wait. It cannot detect:

- Agent stuck on an approval prompt (`blocked` lifecycle) — fleet stall, invisible to the engine
- Agent looping/spinning (`working` indefinitely) — no stuck detection, ADR-0010 punted on timeouts
- Agent done but forgot to call `hordr done` — diagnosed only by bean-status polling
- Agent crashed vs exited cleanly — both look like "pane gone"

ADR-0010 explicitly punted on timeouts because "the daemon does not judge" — without lifecycle state, any timeout is a blind false-positive. Herdr's agent API removes that constraint: `blocked` is a discrete lifecycle classification, not a wall-clock judgment.

## Design Decisions

### 1. New module: `src/herdr/agent.ts`

Thin synchronous wrapper around `herdr agent` subcommands, mirroring the seam pattern in `pane.ts` and `worktree.ts`. Provides:

- `agentStart(name, kind, paneId, args?)` — tracked launch, returns when agent is ready
- `agentPrompt(name, prompt, opts?)` — submit prompt, optional `--wait --until --timeout`
- `agentWait(name, opts?)` — wait for lifecycle state
- `agentRead(name, opts?)` — read output (`--source recent-unwrapped --lines N`)
- `agentSendKeys(name, keys)` — send terminal keys (esc, enter, ctrl+c)
- `agentGet(name | paneId)` — query lifecycle state → `working | blocked | done | idle | unknown`

All return parsed JSON from herdr's response envelope. Same `ShellFn` test seam pattern.

### 2. Lifecycle-aware heal replaces binary `agentActiveInPane`

`heal.ts` gains a new probe: `agentLifecycle(paneId) → LifecycleState`. The heal decision matrix expands:

```
agent lifecycle  + bean status     → action
──────────────────────────────────────────────
working          + not completed   → wait (confirmed, not guessed)
blocked          + not completed   → NEW: auto-interact / escalate / log
done/idle        + completed       + clean → proceed
done/idle        + not completed   → phantom: read output, diagnose
gone             + not completed   → crash: reset to todo (current behavior)
```

This is a read-only projection — same pattern as bean status. Does not duplicate state.

### 3. Named agent spawn replaces `pane run`

`spawnInvocation` changes from `runInPane(paneId, cmd)` to `agentStart(name, kind, pane) + agentPrompt(name, prompt)`. Agent name convention: `hordr:<epic-id>:<role>`. Benefits: stable name across pane heals, visible in herdr UI, addressable by name.

### 4. Config: `kind` field on AgentDefSchema

`AgentDefSchema` needs a `kind` field mapping to herdr's `--kind` values (`opencode`, `claude`, `codex`, etc.). Currently `harness` is a binary name string; herdr's `--kind` is a closed set from the docs.

### 5. Config: `auto_approve` field (optional, per role)

When heal detects `blocked` lifecycle, the engine can auto-interact (`agent send-keys enter`) if `auto_approve: true` is set on the role config. Default: false (escalate only).

## ADR Impact

- **ADR-0010 (no timeouts):** Justified narrowing. "No blind wall-clock timeouts" stays. But `blocked` lifecycle detection enables intervention without timeouts — it's a discrete state, not a duration judgment.
- **ADR-0008 (no lifecycle state):** Already superseded by ADR-0009/0012 for process state. Agent lifecycle is a read-only projection (like bean status), not a duplicate.
- **ADR-0015 (daemonless):** No conflict. `fleet check` stays a stateless CLI. Lifecycle checks are per-pass reads, not a heartbeat.
- **New ADR recommended:** Document the lifecycle-aware heal decision matrix and the `blocked`-intervention policy.

## Epic Decomposition

| Epic | Scope | Blocked-by |
|------|-------|------------|
| Agent lifecycle API + heal | `agent.ts` wrapper, config fields, heal rewrite, engine handling | — |
| Named agent spawn + status | spawn migration, pane-heal reattach by name, fleet status lifecycle | Epic 1 |
| Auto-interact + diagnostics | agent read on stall, configurable auto-approve | Epic 1 |

## Non-Goals

- No long-running daemon (ADR-0015 holds).
- No bean-state duplication (ADR-0010 projection model holds).
- No replacement of the `hordr done` CLI continuation path — lifecycle detection supplements it, doesn't replace it.
- No multi-agent coordination (one agent prompts another) — future work.
