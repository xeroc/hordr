---
# hordr-ze3d
title: Audit each global seam — which are still needed?
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
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
