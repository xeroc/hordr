---
# hordr-tpbh
title: 'Audit cleanup: delete legacy tick/advance pair + dead merge helpers + redundant path-check seams'
status: completed
type: task
priority: high
created_at: 2026-07-28T12:22:51Z
updated_at: 2026-07-28T12:43:41Z
---

Execute the ponytail-audit findings: delete src/dispatch/{tick,advance}.ts + test/helpers/fleet-engine.ts + test/dispatch/{advance,tick}.test.ts; delete mergeBranch + mergeMilestoneToPrimary + MergeResult + their tests; delete assertBeansOnPath/assertHerdrOnPath + the _setBeansPresentForTesting/_setHerdrPresentForTesting seams (mock via _shell instead); shrink: pane.ts HerdrError duplicate + restoreWorktree wrapper. Update AGENTS.md to drop the legacy section.

## Summary of Changes

**Phase 1 — Legacy pair deletion (-1299 lines, -19 tests):**
- Deleted src/dispatch/tick.ts (253 lines) + src/dispatch/advance.ts (267 lines)
- Deleted test/helpers/fleet-engine.ts (276 lines, TestFleetEngine mock)
- Deleted test/dispatch/advance.test.ts (332 lines) + test/dispatch/tick.test.ts (171 lines)
- All 18 lost tests exercised the LEGACY advanceLane path (not production engine.ts).
  Production coverage of these behaviors lives in test/dispatch/engine.test.ts (656 lines):
  worktree quarantine (hordr-zqwo), stale-done cleanup (hordr-sq00),
  milestone auto-complete (hordr-45f3), cross-epic refresh (hordr-lcsi), etc.

**Phase 2 — Dead merge helpers (-73 src lines, -8 tests):**
- Deleted mergeBranch + mergeMilestoneToPrimary + MergeResult interface from src/dispatch/merge.ts
- Production code uses attemptMerge exclusively (lifecycle.ts + engine.ts)
- Deleted their tests in test/dispatch/merge.test.ts (7 mergeBranch + 1 mergeMilestoneToPrimary)
- merge.ts: 165 → 87 lines
- Inlined tryRestore into restoreWorktree (dropped the 1-line forwarder)

**Phase 3 — Redundant path-check seams (-43 src lines):**
- Deleted assertBeansOnPath + _beansPresent + _setBeansPresentForTesting in src/beans/client.ts
  (BEAN_BIN IIFE already resolves at load; ENOENT → BeansError via runBeans catch)
- Deleted assertHerdrOnPath + _herdrPresent + _setHerdrPresentForTesting in src/herdr/worktree.ts
  (execFileSync ENOENT already wrapped as HerdrError by defaultShell)
- Updated 4 test files to drop the seam imports/calls; rewrote the one
  'fails loud when beans not on PATH' test to mock _shell instead (more honest)

**Phase 4 — Small shrinks:**
- src/herdr/pane.ts: dropped duplicate HerdrError class, re-exported from worktree.ts
- src/dispatch/merge.ts: inlined tryRestore, renamed to restoreWorktree

**AGENTS.md:** removed the 'engine.ts vs advance.ts/tick.ts' callout block +
the LEGACY entries in the project-layout tree.

**Verify:** typecheck clean; lint clean (4 pre-existing warnings on untouched
code); 317 passing + 1 pre-existing failure (unrelated: spawn.test.ts 'Then stop'
prompt assertion). Was 344 passing before; -27 tests = 18 legacy + 8 mergeBranch
+ 1 beans-on-PATH (replaced). Net delta: -300 lines across 9 files (excluding
the 5 outright deletions of legacy code).
