---
# hordr-vdww
title: Inline loop.ts dispatchNext into advance.ts
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T08:19:27Z
parent: hordr-s725
---

loop.ts (47 lines) exports dispatchNext, called once from advance.ts:125. The caller adapts signatures both ways:
- fetchDispatchable: advance.ts closes over an already-fetched array → loop.ts receives () => DispatchableBean[]
- spawn: advance.ts adapts (harness, prompt) → {harness, paneId, prompt}

Inline the 7-line body of dispatchNext directly into advance.ts where it's called. Remove loop.ts + loop.test.ts. Remove DispatchDeps interface.

If FleetEngine (epic 1) lands first, this is absorbed naturally — dispatchNext becomes a private method of the engine.

## Summary of Changes

- Inlined the 7-line `dispatchNext` body directly into `advanceLane` in `src/dispatch/advance.ts` (dispatch step around line 120). The empty-check and fetch were already done upstream in the same function, so the inlined version drops the redundant guard and the `DispatchDeps` adapter closures.
- Removed `src/dispatch/loop.ts` (`dispatchNext`, `LaneContext`, `DispatchDeps`, `DispatchOutcome`) — all unreferenced after the inline.
- Removed `test/dispatch/loop.test.ts` — tested a function that no longer exists.
- Removed `test/dispatch/lane-integration.test.ts` — its dispatch step targeted `dispatchNext`; the remaining scan/heal/rollup steps are covered by their own unit suites and the composition is covered by `tick.test.ts`/`advance.test.ts`.
- Swapped the `loop.js` import in `advance.ts` for `role.js` (`resolveRole`) + `spawn.js` (`buildInvocationPrompt`).
- Updated the dispatch/ file-tree in `AGENTS.md` and `README.md` (removed the `loop.ts` line) and the pure-function deps example in `AGENTS.md` (`DispatchDeps` → `AdvanceLaneDeps`).

Verified: `bun run typecheck` clean, `bun run lint` 0 errors (2 pre-existing warnings untouched), all 62 Bun-runnable dispatch tests pass (advance/heal/rollup/scan/role/spawn/merge/dispatch/done). The 5 `tick.test.ts` failures are the pre-existing `better-sqlite3`-under-Bun environment issue (`0 pass, 5 fail`, all crashing at `new Database(...)`), unrelated to this change.
