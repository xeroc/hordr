# Daemonless fleet: inline `hordr done` + `hordr fleet check`

**Supersedes:** ADR-0004 (unix-socket daemon stub), ADR-0010 (bean-projection broker), ADR-0012 (daemon-as-broker with SQLite process state), ADR-0014 (per-epic worktrees — mechanics retained, the _trigger_ changes).
**Date:** 2026-07-16.

## Context

ADR-0012 made the daemon a long-running broker: a unix-socket HTTP server holding an open SQLite handle, running a `setInterval` tick (scan + heal + merge + spawn) every 5 s, plus `/done` and `/blocked` routes. The agent's `hordr done` command was a thin HTTP client that POSTed to the socket and printed the response.

Re-reading the daemon's actual responsibilities surfaced that the long-running _process_ was never the load-bearing part — the _pure dispatch functions_ were. The socket/HTTP layer was pure indirection: `hordr done` already shells out; computing `next` in-process and printing it is byte-identical to the agent. SQLite is per-process (WAL); `spawnInvocation` is just tmux send-keys with no daemon state. The only thing the long-running process bought was _autonomy_ — a 5 s heartbeat that healed crashes and created new lanes as epics unblocked.

## Decision

Delete the daemon, the socket, and the routes. Replace them with two stateless CLI commands that compose the same pure dispatch core:

| Command             | Owns                                                                                                                                                                                      | Trigger                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `hordr done <task>` | **lane-local:** verify (clean + completed) → rollup ancestors → continue (print `next`, or `null`).                                                                                       | the agent, in its own turn |
| `hordr fleet check` | **fleet-wide:** scan for new lanes → heal crashed agents → merge completed epics → spawn idle lanes → recover worktrees → mark milestones completed. Idempotent; one pass per invocation. | manual, or cron            |

`hordr done` is **lock-free**: writes are lane-local (each lane owns its worktree's `.beans` dir, `resolveBeansDir`), so concurrent `done` calls from sibling lanes touch disjoint state. `hordr fleet check` is guarded by a **PID-file lock** (`~/.hordr/fleet.lock`, `HORDR_LOCK` override): O_EXCL create, stale-PID steal on collision (a crashed/killed check's lockfile is taken over by the next run). `hordr daemon` and the `/blocked` route are removed outright; an agent that yields simply exits and the next `fleet check` heal resets its bean to `todo` (heal is a strict superset of the old `/blocked` signal).

`hordr fleet create` drops the `ensureDaemon` precondition and runs exactly one `fleet check` pass at the end so lanes spawn immediately instead of waiting for the first cron tick.

The cron recommendation (README + fleet-guide) is the path back to the old autonomy without a process to supervise:

```
*/5 * * * * hordr fleet check >> ~/.hordr/fleet.log 2>&1
```

## What stays

The entire pure dispatch core is unchanged and reused verbatim: `engine.scanFleet` / `advanceLane`, `heal.checkInvocation`, `rollup`, `mergeBranch`, `scanForNewLanes`, `spawnInvocation`, `continueLane`, `runDoneChecks`. The dispatch modules remain pure functions with injected dependencies; the only change is _who calls them_ — a CLI command instead of a `setInterval`. SQLite storage (`fleets`, `lanes`, `projects`, `provenance`) is unchanged.

## Consequences

- **No supervised process.** A fleet with no `fleet check` running makes no autonomous progress. Cron (or the operator) is the heartbeat. A crashed agent sits frozen until the next check — acceptable and explicit, not a silent stall.
- **Simpler failure surface.** No socket to go stale, no daemon to OOM/leak, no `EADDRINUSE` recovery, no signal handling. Every run is a fresh process: open DB → work → close DB → exit.
- **Concurrency is explicit.** The lock serializes only `fleet check` vs `fleet check` (the one real contention point — merges into the shared `ms` branch and shared `lanes` writes). Single-machine ceiling is documented; hordr is tmux-local by definition.
- **Agent vocabulary shrinks to one command** (`hordr done`). Continuation survives intact: the agent reads `next` from stdout and continues in-place, exactly as before.
