---
# hordr-2asd
title: Remove 8 global mutable test seams
status: completed
type: epic
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T07:43:49Z
parent: hordr-sjue
---

8 module-level mutables exist for test injection:

1. beans/client.ts — _setShellForTesting
2. dispatch.ts — _setShellForTesting
3. herdr/worktree.ts — _setShellForTesting
4. herdr/pane.ts — _setShellForTesting
5. runtime.ts — _setGitRunnerForTesting
6. runtime.ts — _setDepsForTesting
7. daemon/ensure.ts — _setEnsureDaemonForTesting
8. storage/project.ts — _setProjectKeyResolverForTesting

Each has its own reset convention. Tests must remember to reset in afterEach. Order matters. Easy to forget one → state leaks between tests.

**This epic depends on epic 1 (FleetEngine).** Once FleetEngine exists, tests inject a mock FleetEngine (2 methods) instead of patching module globals. The module seams (_setShellForTesting) become unnecessary — the test goes through the engine interface.

**Approach:** For each global, either:
- Remove it if all callers now go through FleetEngine (the engine calls the real module, tests mock the engine).
- Keep it only if a module is used directly outside FleetEngine (e.g., beans/client.ts getBean is used by commands/fleet/create.ts directly).

Don't remove a seam that still has direct callers outside the engine.
