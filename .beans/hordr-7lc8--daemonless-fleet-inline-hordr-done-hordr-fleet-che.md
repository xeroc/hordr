---
# hordr-7lc8
title: 'Daemonless fleet: inline hordr done + hordr fleet check'
status: completed
type: task
priority: normal
created_at: 2026-07-16T18:56:33Z
updated_at: 2026-07-16T19:26:08Z
---

Remove the long-running daemon/socket. hordr done becomes inline (verify+rollup+continue). New hordr fleet check (flock-guarded, idempotent scanFleet pass) replaces the tick. fleet create drops daemon requirement and runs one check to start. Drop /blocked. Delete daemon module + blocked command/handler. ADR-0015 supersedes 0004/0010/0012/0014. Update README + fleet-guide.

## Plan

- [x] Lock helper (src/storage/lock.ts): O_EXCL PID-file lock with stale detection, injectable liveness probe, exit-unlink
- [ ] hordr done: rewrite to inline (openFleetDb + createFleetEngine + handleDone wiring, drop socket POST)
- [x] hordr fleet check: new command (lock -> engine.scanFleet -> release)
- [ ] fleet create: drop ensureDaemon, run one scanFleet pass to start lanes
- [ ] Drop /blocked: delete src/commands/blocked.ts, src/dispatch/blocked.ts, tests
- [x] Delete daemon module: src/daemon/{server,socket,broker,ensure}.ts + src/commands/daemon.ts + tests
- [ ] Remove dead refs: tick.ts if unused, broker/ensure imports
- [ ] ADR-0015 (supersedes 0004/0010/0012/0014)
- [ ] README + docs/fleet-guide.md daemon section -> fleet check + cron note
- [x] lint + typecheck + full test green (311 passing, 0 errors)

## Summary of Changes

Removed the long-running daemon/socket (ADR-0015). The pure dispatch core is reused verbatim; only the *trigger* changed.

**New/changed commands**
- `hordr done <task>` — now inline (verify + rollup + continue). Lock-free (lane-local writes). Formerly a socket POST. Exports `mapDoneResponse` for the agent-facing JSON+exit-code contract.
- `hordr fleet check` — NEW. One idempotent `engine.scanFleet` pass guarded by a PID-file lock. Replaces the 5s tick. Pure core `runFleetCheck(db, deps)` is unit-tested.
- `hordr fleet create` — drops the `ensureDaemon` precondition; runs one `fleet check` pass so lanes spawn immediately.

**New module**
- `src/storage/lock.ts` — O_EXCL PID-file mutex (`~/.hordr/fleet.lock`, `HORDR_LOCK`), stale-PID steal, idempotent release + exit-hook.

**Deleted**
- `src/daemon/` (server, socket, broker, ensure), `src/commands/daemon.ts`, `src/commands/blocked.ts`, `src/dispatch/blocked.ts`, `test/daemon/`, `test/dispatch/blocked.test.ts`.
- `createFleet` lost its `ensureDaemon` dep.

**Kept as-is:** `handleDone`/`runDoneChecks` (dispatch/done.ts), `engine.ts` scanFleet/advanceLane, all pure dispatch modules, `tick.ts` (still used by the test helper).

**Docs:** ADR-0015 + superseded markers on 0004/0010/0012/0014; README command table, architecture tree, fleet-model sections, ADR table; docs/fleet-guide.md broker→check-loop rewording. Cron recipe documented: `*/5 * * * * hordr fleet check >> ~/.hordr/fleet.log 2>&1`.

**Verification:** tsc clean, eslint 0 errors, 311 tests passing (8 new: lock×5, runFleetCheck×3, mapDoneResponse×4; existing done.handleDone/runDoneChecks retained).
