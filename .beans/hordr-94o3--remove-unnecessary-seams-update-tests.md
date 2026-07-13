---
# hordr-94o3
title: Remove unnecessary seams + update tests
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:27:46Z
parent: hordr-2asd
---

Based on the audit, remove the global seams that are fully covered by FleetEngine. For each removal:
1. Delete the _setXForTesting export + the let _x mutable.
2. Delete the _resetX export.
3. Update all tests that used the seam to use FleetEngine mock instead.
4. Remove afterEach reset calls for that seam.

Keep seams that have direct callers outside FleetEngine (e.g., getBean in commands/fleet/create.ts).

## Audit Results (all 8 seams — KEEP)

Ran the audit inline (hordr-ze3d was still todo). For each seam, grepped
production callers (non-test) outside the (future) FleetEngine.

| # | Seam | Direct callers outside engine | Verdict |
|---|------|-------------------------------|---------|
| 1 | beans/client.ts _setShellForTesting | commands/{run,finish,daemon}, fleet/{create,finish}, harness/launcher | KEEP |
| 2 | dispatch/dispatch.ts _setShellForTesting | commands/fleet/{status,finish} | KEEP |
| 3 | herdr/worktree.ts _setShellForTesting | runtime, commands/{cleanup,finish}, fleet/{create,abort} | KEEP |
| 4 | herdr/pane.ts _setShellForTesting | harness/launcher | KEEP |
| 5 | runtime.ts _setGitRunnerForTesting | commands/fleet/{finish,abort,create} | KEEP |
| 6 | runtime.ts _setDepsForTesting | commands/run | KEEP |
| 7 | daemon/ensure.ts _setEnsureDaemonForTesting | commands/fleet/create | KEEP |
| 8 | storage/project.ts _setProjectKeyResolverForTesting | commands/fleet/{status,reset,finish,create,abort} | KEEP |

## Blocker: FleetEngine does not exist yet

- hordr-mef5 (Create FleetEngine module) is still todo.
- The parent epic hordr-2asd states: "This epic depends on epic 1 (FleetEngine)."
- The bean's own rule: "Keep seams that have direct callers outside FleetEngine."
- Every one of the 8 seams has direct production callers outside the
  (nonexistent) FleetEngine. Removing any would break production code.

## Summary of Changes

No code changes. The correct implementation of this task today is KEEP ALL 8:
the premise ("seams fully covered by FleetEngine") is not met for any seam
because FleetEngine does not exist yet and every seam still has direct
production callers outside it. Re-dispatch this bean after hordr-mef5 lands
and absorbs the engine-side call sites.
