---
# hordr-i6ed
title: Store project root on fleet row; make all fleet commands cwd-independent
status: completed
type: feature
priority: high
created_at: 2026-07-29T10:53:26Z
updated_at: 2026-07-29T11:09:18Z
---

Add project_root column to fleets table. All fleet commands (status/finish/abort/reset) look up fleets by milestone id using stored project_root — no cwd dependency. Only 'fleet create' uses cwd. Migration for existing DBs.

## Summary of Changes

### DB schema (src/storage/db.ts)
- Added `project_root TEXT NOT NULL DEFAULT ''` column to `fleets` table.
- Migration for existing DBs: `ALTER TABLE fleets ADD COLUMN project_root TEXT NOT NULL DEFAULT ''`.

### Storage (src/storage/fleets.ts)
- `FleetRow.projectRoot?: string` — optional (default '') so test fixtures don't all need updating; production always sets it.
- `registerFleet` stores `project_root`.
- New `getFleetByMilestone(db, milestoneId)` — looks up fleet by milestone id alone, cross-project. Bean ids are project-prefixed so collisions are practically impossible.

### Lifecycle (src/fleet/lifecycle.ts)
- `createFleet` stores `projectRoot: opts.cwd` in the fleet row.

### Commands — all cwd-independent except create (hordr-i6ed)
- **status.ts** (milestone arg): uses `getFleetByMilestone` — no `resolveProjectKeyOrMock`.
- **finish.ts**: `getFleetByMilestone`, `mainRepoCwd = fleet.projectRoot || process.cwd()`.
- **abort.ts**: `getFleetByMilestone`, `cwd = fleet.projectRoot || process.cwd()`.
- **reset.ts**: `getFleetByMilestone`, uses `fleet.projectKey` for lane lookup.
- **create.ts**: unchanged — cwd is the one place it matters (resolves projectKey + creates worktrees).
- **check.ts**: unchanged — engine loop already iterates all projects.

### Tests
- +1 storage test (`getFleetByMilestone` cross-project).
- +1 status test (milestone found from different project cwd).
- +1 finish test (`mainRepoCwd` comes from `fleet.projectRoot`).
- 331 total pass, 0 lint errors.
