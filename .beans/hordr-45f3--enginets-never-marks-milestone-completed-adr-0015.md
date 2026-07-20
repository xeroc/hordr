---
# hordr-45f3
title: 'engine.ts: never marks milestone completed (ADR-0015 regression)'
status: in-progress
type: bug
priority: high
created_at: 2026-07-20T07:37:13Z
updated_at: 2026-07-20T07:37:13Z
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
