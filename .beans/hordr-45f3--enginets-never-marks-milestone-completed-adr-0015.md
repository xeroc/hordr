---
# hordr-45f3
title: 'engine.ts: never marks milestone completed (ADR-0015 regression)'
status: completed
type: bug
priority: high
created_at: 2026-07-20T07:37:13Z
updated_at: 2026-07-20T07:59:13Z
---

## Symptom

When all epics under a fleet complete, the milestone bean stays `todo` forever. `hordr fleet finish` then throws at `lifecycle.ts:174`: `"milestone X is not completed — rollup must close it first"`. User must manually run `beans update <milestone> -s completed` to unblock finish.

## Root cause

The per-task `rollup` walk in `dispatch.ts:207` explicitly stops at the epic level (`if (node.type === 'epic') break // stop at epic — milestone-level is fleet finish's job`). So no per-task rollup ever marks the milestone.

The fleet-level sweep that closes this gap exists in `tick.ts:193-205` but was never ported to `engine.ts` (production, ADR-0015). Confirmed by grep: only `tick.ts:202` ever calls `markCompleted(fleet.milestoneBeanId)`.

ADR-0015 line 19 explicitly lists "mark milestones completed" as a `hordr fleet check` responsibility. The check command's own doc comment repeats it. Implementation missed it.

## Fix

Port the 8-line fleet-completion sweep from `tick.ts:193-205` into `engine.ts:scanFleet`, after the lane loop, before returning. TDD: failing test first.

## Acceptance Criteria

- [ ] RED: scanFleet with all epics completed does NOT mark milestone completed (current bug)
- [ ] GREEN: scanFleet marks milestone completed + commits beans when all epic children reach terminal status
- [ ] No new abstractions — direct port
- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [ ] existing tests still pass


## Summary of Changes

- `src/dispatch/engine.ts`: new top-level helper `maybeCompleteMilestone(fleet)` (ports `tick.ts:193-205`), called at the end of each fleet scan. When milestone is not `completed` and every epic child is in terminal status (`completed`/`scrapped`), it calls `markBeanCompleted(ms)` + `commitBeans`.
- `test/dispatch/engine.test.ts`: new `scanFleet: milestone auto-completion (hordr-45f3, ADR-0015)` describe block. Two tests: positive (all epics completed → `beans update <ms> -s completed` fires) and negative (one epic still todo → no update fires).
- Also had to update one pre-existing test (`does not let one broken fleet abort scanning of other healthy fleets`) to mock the beans-client shell — the new sweep calls `getBean(ms)` which routes through that seam. Mock returns `status: completed` so the sweep skips.

332/332 tests pass, lint clean (4 pre-existing warnings).
