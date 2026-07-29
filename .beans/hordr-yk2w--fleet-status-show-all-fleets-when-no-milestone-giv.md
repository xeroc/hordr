---
# hordr-yk2w
title: 'fleet status: show all fleets when no milestone given'
status: completed
type: task
priority: normal
created_at: 2026-07-29T06:34:11Z
updated_at: 2026-07-29T06:41:39Z
---

Refactor fleet status command so that when no milestone bean id is provided it lists every fleet (scoped to the current project) instead of erroring on a required arg.

## Summary of Changes

- [`src/storage/fleets.ts`](src/storage/fleets.ts): extended `listFleets` with an optional `projectKey` filter (backward compatible — existing `{status}` callers in `engine.ts` unaffected).
- [`src/commands/fleet/status.ts`](src/commands/fleet/status.ts): made the `milestone` arg optional. With no arg, lists every fleet for the current project. Extracted per-fleet rendering into `emitFleet`/`fleetJson` helpers so single- and multi-fleet paths share one implementation.
- [`test/commands/fleet/status.test.ts`](test/commands/fleet/status.test.ts): added `seedSecondFleet` and 3 new tests covering no-arg human/json output and the empty-state message.

Behavior:
- `fleet status <id>` → unchanged (single fleet object in --json).
- `fleet status` → lists all fleets for the project; `--json` emits an array of per-fleet objects (same shape as the single-fleet object). Empty state prints `no fleets for project <pk>` (or `[]`).
