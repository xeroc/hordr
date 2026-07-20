---
# hordr-nrpe
title: delete tick.ts + advance.ts + TestFleetEngine; migrate or drop 19 legacy tests
status: todo
type: task
priority: normal
created_at: 2026-07-20T08:55:09Z
updated_at: 2026-07-20T08:55:09Z
parent: hordr-7hpb
---

## Context

Per AGENTS.md note (added in f9b7bee): engine.ts is now feature-complete vs tick.ts after three 2026-07 ports (hordr-sq00, hordr-45f3, hordr-lcsi). The legacy pair (tick.ts 253 LOC + advance.ts 267 LOC) and their test scaffolding (`test/helpers/fleet-engine.ts` 276 LOC) are now strictly redundant.

## Work

Delete:
- `src/dispatch/tick.ts`
- `src/dispatch/advance.ts`
- `test/helpers/fleet-engine.ts`
- `test/dispatch/tick.test.ts` (6 tests, all redundant with engine.test.ts)
- `test/dispatch/advance.test.ts` (13 tests — migrate any unique coverage to `test/dispatch/engine.test.ts`, delete the redundant ones)

Update:
- `AGENTS.md` project-layout block: remove tick.ts/advance.ts lines and the "Status (Jul 2026)" cleanup note (it’ll be done).

## Acceptance Criteria

- [ ] No production import references tick.ts or advance.ts
- [ ] `bun run test` count drops only by explicitly-redundant cases (target: ≤19 fewer tests, 0 production behavior change)
- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [ ] AGENTS.md updated to remove the cleanup note

## Why now

The legacy pair was the bug source for three missing-port bugs. Keeping it invites the same class back. Migration is mechanical — both engines call the same shared pure helpers (rollup.ts, scan.ts, heal.ts, dispatch.ts); only the wiring differs.
