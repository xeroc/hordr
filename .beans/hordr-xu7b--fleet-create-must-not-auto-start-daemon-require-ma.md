---
# hordr-xu7b
title: fleet create must not auto-start daemon — require manual start
status: completed
type: bug
priority: high
created_at: 2026-07-13T20:18:31Z
updated_at: 2026-07-13T20:25:42Z
---

## Problem

`hordr fleet create` auto-spawns the daemon via `ensureDaemonRunning` (`src/daemon/ensure.ts`). The user must explicitly opt into running the daemon. Auto-background spawns hide the long-running process from the operator and break the explicit-control contract.

## Acceptance Criteria

- [x] Tests updated to assert the new contract (RED first)
- [x] `src/daemon/ensure.ts` no longer spawns; throws a typed error telling user to run `hordr daemon`
- [x] `src/fleet/lifecycle.ts` drops `daemonStarted` from result; propagates the error
- [x] `src/commands/fleet/create.ts` updated message + JSON output
- [x] `bun run lint` clean
- [x] `bun run test` green

## Summary of Changes

- Reordered `createFleet`: daemon reachability check now runs BEFORE any side effects (worktree, fleet row) so a dead daemon leaves no partial state.
- `requireDaemonRunning` (`src/daemon/ensure.ts`) replaces `ensureDaemonRunning`: no more `spawn('hordr', ['daemon'])`. Throws `FleetError` with the socket path + the exact `hordr daemon` invocation to run.
- `CreateFleetResult` dropped `daemonStarted` — fleet create no longer manages daemon lifecycle.
- CLI output trimmed: plain `fleet <id> created on <branch>`; JSON emits only `{milestone, branch, projectKey}`.
- Tests: 263 passing; added one new case in each suite for the dead-daemon refusal path.
