---
# hordr-hmbq
title: Rollup bean writes must be committed before worktree removal
status: completed
type: bug
priority: high
created_at: 2026-07-17T14:07:18Z
updated_at: 2026-07-17T14:26:00Z
---

Symptom: lane worktree cannot be removed at epic completion. git worktree remove refuses with 'contains modified or untracked files' pointing at .beans/.

Root cause: commitBeans in engine.ts is conditional (if rollupAncestors). Once any tick writes the epic=completed bean change but the commit is skipped (rollupAncestors returns false on subsequent ticks because epic is already completed in the file) OR fails (pre-commit hook modifies .md and aborts), the dirt persists. dirtyNonBeansPaths tolerates .beans/ dirt, but git worktree remove does not. Lane stalls indefinitely on the remove step.

Fix:
- Extract commitBeanChanges as a pure dep-injected function (matches dispatch/ pattern).
- Make it idempotent: skip the commit when nothing is staged (git diff --cached --quiet exit 0).
- Drop the if (rollupAncestors) conditional in advanceLane + continueTask rollup dep — always commit (now safe).
- Add a defensive commitBeanChanges call inside mergeEpicLane right before removeWorktreeByPath — catches straggler dirt regardless of how it got there.
- Same defensive commit in finishFleet before removeWorktree (ms worktree, same risk).

TDD: RED unit test on commitBeanChanges (nothing-to-commit is tolerated, real errors propagate, commit only when staged). Then GREEN. typecheck + lint + full suite green.

## Summary of Changes

**Root cause:** `commitBeans` in engine.ts was called conditionally (`if (rollupAncestors(...))`). Once any tick wrote the epic=completed bean change but the commit was skipped (rollupAncestors returns false on subsequent ticks because the epic is already completed in the file) OR failed (pre-commit hook modifies a .md and aborts, index lock, etc.), the .beans/ dirt persisted. `dirtyNonBeansPaths` deliberately tolerates .beans/ dirt, but `git worktree remove` (no --force) does NOT — so the lane stalled on the remove step indefinitely. Same latent risk in finishFleet for the milestone worktree.

**Fix:**
- `src/dispatch/commit-beans.ts` (NEW): pure dep-injected `commitBeanChanges(opts, deps)` — stages beans dir, then commits only when something is staged (`git diff --cached --quiet` exit 1 = staged diffs exist). Idempotent: a clean worktree produces no commit, no throw. Real git errors propagate. Matches the dispatch/ pure-function pattern.
- `src/beans/dir.ts` (NEW): extracted `resolveBeansDir(worktreePath)` — third use justifies the helper. Reads .beans.yml (default '.beans'). Shared by engine.ts and lifecycle.ts; deletes the engine-local copy.
- `src/dispatch/engine.ts`:
  - Dropped the `if (rollupAncestors(...))` conditional in advanceLane (proceed path), continueTask's rollup dep, and the idle-path rollupSweep call. Always commit. With idempotency this is safe and mops up the agent's own `beans update` writes even when rollup marked nothing new.
  - Added a defensive `commitBeans(lane.worktreePath)` inside `mergeEpicLane` right before `removeWorktreeByPath`. Catches straggler dirt regardless of how it got there.
- `src/fleet/lifecycle.ts` + `src/commands/fleet/finish.ts`: added `beansDir` to FinishFleetDeps and the same defensive commit before `removeWorktree` (milestone worktree, same risk).

**TDD:** RED first — 5 unit tests for commitBeanChanges (stages then commits when diff throws, skips commit when nothing staged, propagates real git errors from add, propagates errors from commit, all calls scoped to cwd). Then GREEN. Plus 2 regression tests in fleet/lifecycle.test.ts: (a) defensive commit fires BEFORE removeWorktree when staged dirt exists, (b) idempotent skip when nothing staged.

**Verify:** typecheck clean. 0 lint errors (4 pre-existing warnings untouched). 329 passing, 0 failing.

**Note on AGENTS.md drift:** the guide mentions a `squash.ts` with `squashRollup` (fixup + autosquash into the work commit) — that file doesn't exist; the design was captured in hordr-0b7x (completed) but the code was removed. Current behavior is a separate `chore(beans): rollup status changes` commit, not squashed. A separate cleanup bean should reconcile AGENTS.md with reality.
