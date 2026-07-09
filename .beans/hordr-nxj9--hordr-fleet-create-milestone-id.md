---
# hordr-nxj9
title: hordr fleet create <milestone-id>
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T07:23:44Z
parent: hordr-t3wf
---

Validate milestone bean (type=milestone, has team/company ref), create worktree milestone/<id> on --base, write fleet row (SQLite, status=active), ensure daemon running (lazy auto-start), start per-fleet loop. Scope all beans calls to the worktree cwd.



## Per-epic model update (grilling session)

fleet create now: (1) creates milestone integration branch ms/<id> from primary, (2) scans for unblocked epics under the milestone, (3) creates lanes (worktrees) for each unblocked epic, (4) starts the daemon with per-lane dispatch loops. Does NOT create one shared worktree — that was the old serialized model.

## Summary of Changes

- `src/storage/fleets.ts`: fleet + lane repository (projects/fleets/lanes CRUD) over SQLite
- `src/storage/db.ts`: `defaultDbPath` + `openFleetDb` (schema-ensuring opener)
- `src/storage/project.ts`: `resolveProjectKeyOrMock` test seam
- `src/runtime.ts`: `getGitRunner()` getter (reuses the test-overridable git runner)
- `src/daemon/ensure.ts`: lazy daemon auto-start (socket /health probe + detached spawn)
- `src/fleet/lifecycle.ts`: `createFleet` — validates milestone, creates ms/<id> branch, registers fleet row, ensures daemon; refuses non-milestone + duplicate active fleet
- `src/commands/fleet/create.ts`: `hordr fleet create <milestone-id>` [--base] [--json]
- Tests: fleets store (in-memory), createFleet lifecycle, command happy/error paths

Note: lane/worktree creation is intentionally NOT done at create time — ADR-0014 makes it tick-driven (the daemon scanner owns it).
