---
# hordr-wd46
title: 'Teardown dirty-guard: refuse --force worktree removal with uncommitted changes'
status: completed
type: bug
priority: high
created_at: 2026-07-15T13:00:56Z
updated_at: 2026-07-15T13:37:36Z
parent: hordr-4j5j
---

## Problem

Epic-merge teardown force-removes the lane worktree unconditionally, destroying any uncommitted changes:

- src/herdr/worktree.ts:185 → `['worktree', 'remove', '--workspace', opts.workspaceId, '--force', '--json']`
- src/dispatch/advance.ts:214 → `deps.removeWorktree(opts.lane.branch)` inside `mergeEpicLane`, with no dirty-check beforehand.
- src/herdr/worktree.ts:195 `removeWorktreeByBranch` — comment says it backs "fleet abort --force and the broker's epic-merge teardown."

Plain `git worktree remove` refuses a dirty tree; the unconditional `--force` silently nukes it. In the tributary-fot9 incident this is what erased the real, lint-clean `execute.ts` refactor: the agent hadn't committed, but the lane was torn down anyway. This is the last-chance safety net — even if the checkInvocation gate (hordr-7zxr) is bypassed or a future regression re-opens the race, the teardown must not destroy evidence.

## Change

Gate worktree removal behind a cleanliness check. Two layers:

1. **`mergeEpicLane` (advance.ts:198)** — before `deps.removeWorktree`, require the lane worktree to be clean (or only beans-dir dirty). If dirty with non-bean files:
   - Do NOT remove the worktree.
   - Flip the lane status to `error` (or a new `uncommitted` status — reuse `conflict`-style handling already present in mergeEpicLane for conflicts).
   - Log loudly + surface to the human. Keep the worktree so the work is recoverable.
2. **`removeWorktree` / `removeWorktreeByBranch` (worktree.ts:178/195)** — drop the unconditional `--force`. Either:
   - Remove `--force` and let git refuse dirty trees (clean trees still remove fine), OR
   - Keep `--force` only behind an explicit opt-in flag (e.g. `abort --force` passes it; the epic-merge path does NOT).

Decide and document the policy for beans-dir-only dirt (bean-status writes are normal during rollup — see engine.ts:93-94 which stages+commits the beans dir before teardown; that path should remain clean by the time removal runs).

## TDD checklist

- [ ] `mergeEpicLane`: clean worktree → removes + marks lane done (existing behavior preserved)
- [ ] `mergeEpicLane`: dirty worktree (non-bean file) → does NOT remove, lane → error/uncommitted, logs dirty path
- [ ] `mergeEpicLane`: conflict case still flips lane to `conflict` (unchanged)
- [ ] `removeWorktree` no longer passes `--force` unconditionally; abort path still can force via explicit flag
- [ ] Inject a `gitStatus`/`isClean` seam — tests mock it, no real git I/O in unit tests
- [ ] Add an integration-level check that the rollup beans-commit (engine.ts:93-94) leaves the tree clean before teardown runs, so normal rollups aren't blocked
- [x] `bun run lint` clean (0 errors); `bun test` green (265 passing)

## Key references

- src/herdr/worktree.ts:178-185 — removeWorktree + the `--force` flag
- src/herdr/worktree.ts:195 — removeWorktreeByBranch (abort + epic-merge path)
- src/dispatch/advance.ts:198-217 — mergeEpicLane, call site at :214
- src/dispatch/engine.ts:93-94 — beans-dir stage+commit that should leave tree clean pre-teardown
- Incident: tributary-fot9 / tributary-r00t (uncommitted `execute.ts` refactor destroyed on lane teardown)

## Out of scope

- The checkInvocation clean-worktree gate (hordr-7zxr) is the primary fix; this bean is the defense-in-depth net at removal time.
- The harness-prompt ordering fix is a separate bean.

## Summary of Changes

Two-layer defense-in-depth so epic-merge teardown never destroys uncommitted work:

**Layer 1 -- `mergeEpicLane` dirty guard** (`advance.ts` + `engine.ts`):
Before `removeWorktree`, check for dirty non-beans paths. If found: do NOT remove, flip lane to `uncommitted`, log loudly (names the dirty files), return `blocked`. Worktree kept so work is recoverable. Beans-dir-only dirt is tolerated (ephemeral rollup status, committed by `commitBeans` before the guard runs).

- `advance.ts` (pure, tested): new `worktreeDirtyPaths` seam on `AdvanceLaneDeps` -- tests mock it, zero real git I/O.
- `engine.ts` (prod daemon path): `dirtyNonBeansPaths()` runs `git status --porcelain` + filters beans dir via `resolveBeansDir()`.

**Layer 2 -- `removeWorktree` force flag** (`herdr/worktree.ts`):
`--force` is now opt-in (`opts.force === true`). Default: no force so git refuses dirty trees (clean trees still remove fine). The stale comment is gone.

- `abort.ts` local helper passes `force: true` (already gated behind `--force` user flag).
- `removeWorktreeByBranch` gains an optional `{force?}` param.
- `finish.ts` / `runtime.ts` (single-bean mode) correctly lose force -- dirty worktree now surfaces instead of silently nuking.

**Policy on beans-dir dirt**: tolerated. `commitBeans` (engine.ts:90-95) stages+commits `.beans` before teardown; the guard runs after, and even filters beans-dir from the check so a residual uncommitted beans change never blocks a normal rollup.

`tick.ts` `TickDeps` + fleet-engine test helper wired with the new seam. 265 tests green, 0 lint errors.
