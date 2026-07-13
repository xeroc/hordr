---
# hordr-ze3d
title: Audit each global seam — which are still needed?
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:36:37Z
parent: hordr-2asd
---

For each of the 8 global seams, grep for production callers (not test files). If all production callers go through FleetEngine, the seam is unnecessary.

Report:
- _shell (beans/client.ts): callers outside engine?
- _shell (dispatch.ts): callers outside engine?
- _shell (worktree.ts): callers outside engine?
- _shell (pane.ts): callers outside engine?
- _gitRunner (runtime.ts): callers outside engine?
- _deps (runtime.ts): callers outside engine?
- _ensureDaemon (ensure.ts): callers outside engine?
- _projectKeyResolver (project.ts): callers outside engine?

This is a research task — produce a table, don't change code.

## Audit Results

Grepped production callers (non-test) of each seam-bearing module.
'Engine' = the planned FleetEngine (hordr-mef5, still todo) + today's
daemon/dispatch/fleet runtime. 'Outside engine' = src/commands/* (CLI)
and src/harness/* (single-bean launcher).

| # | Seam | Direct callers OUTSIDE engine | Verdict |
|---|------|-------------------------------|---------|
| 1 | beans/client.ts _setShellForTesting | commands/{run,daemon,finish}, commands/fleet/{create,finish}, harness/launcher.ts (getBody) | KEEP |
| 2 | dispatch/dispatch.ts _setShellForTesting | commands/fleet/status.ts (listDrafts), commands/fleet/finish.ts (fetchChildStatuses) | KEEP |
| 3 | herdr/worktree.ts _setShellForTesting | runtime.ts, commands/{cleanup,finish}, commands/fleet/{create,abort} | KEEP |
| 4 | herdr/pane.ts _setShellForTesting | harness/launcher.ts (createTab, paneLabel, runInPane) | KEEP |
| 5 | runtime.ts _setGitRunnerForTesting | commands/fleet/{create,abort,finish} (getGitRunner), commands/finish.ts (gitMergeBranch) | KEEP |
| 6 | runtime.ts _setDepsForTesting | commands/run.ts (getDeps) — only caller, non-engine | KEEP |
| 7 | daemon/ensure.ts _setEnsureDaemonForTesting | commands/fleet/create.ts (ensureDaemon) — only caller, non-engine | KEEP |
| 8 | storage/project.ts _setProjectKeyResolverForTesting | commands/fleet/{status,reset,finish,create,abort} — ALL callers non-engine | KEEP |

## Verdict: KEEP ALL 8

Every seam has direct production callers outside the (future) FleetEngine.
None can be removed today without breaking production code.

Engine-side call sites that WILL fold into FleetEngine once hordr-mef5 lands:
- src/daemon/broker.ts → beans/client.ts (getBean, markBeanCompleted),
  dispatch.ts (fetchAncestry, fetchEpics, getDispatchable),
  herdr/worktree.ts (createWorktree, openWorktree, removeWorktreeByBranch),
  herdr/pane.ts (createTab, paneExists), runtime.ts (getGitRunner ×4)

Non-engine call sites that will REMAIN direct (these justify keeping each seam):
- src/commands/run.ts → beans/client.ts (getBean), runtime.ts (getDeps)
- src/commands/daemon.ts → beans/client.ts (getBean)
- src/commands/finish.ts → beans/client.ts (getBean), runtime.ts (gitMergeBranch),
  herdr/worktree.ts (branchFor, openWorktree, removeWorktree)
- src/commands/cleanup.ts → herdr/worktree.ts (branchFor, openWorktree, removeWorktree)
- src/commands/fleet/create.ts → beans/client.ts, dispatch n/a, herdr/worktree.ts,
  runtime.ts (getGitRunner), daemon/ensure.ts (ensureDaemon), storage/project.ts
- src/commands/fleet/abort.ts → herdr/worktree.ts, runtime.ts (getGitRunner), storage/project.ts
- src/commands/fleet/finish.ts → beans/client.ts, dispatch.ts (fetchChildStatuses),
  runtime.ts (getGitRunner), storage/project.ts
- src/commands/fleet/status.ts → dispatch.ts (listDrafts), storage/project.ts
- src/commands/fleet/reset.ts → storage/project.ts
- src/harness/launcher.ts → beans/client.ts (getBody), herdr/pane.ts (createTab, runInPane)

## Summary of Changes

Research-only task — no code changed. Re-dispatch after hordr-mef5 (FleetEngine)
lands and absorbs the engine-side call sites listed above; even then, every seam
except possibly #5 and #6 will still be needed for the CLI/harness paths.
