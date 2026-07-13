---
# hordr-94o3
title: Remove unnecessary seams + update tests
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-2asd
---

Based on the audit, remove the global seams that are fully covered by FleetEngine. For each removal:
1. Delete the _setXForTesting export + the let _x mutable.
2. Delete the _resetX export.
3. Update all tests that used the seam to use FleetEngine mock instead.
4. Remove afterEach reset calls for that seam.

Keep seams that have direct callers outside FleetEngine (e.g., getBean in commands/fleet/create.ts).
