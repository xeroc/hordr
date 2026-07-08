---
# hordr-8mri
title: Add lanes table to SQLite schema
status: completed
type: task
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:51:06Z
parent: hordr-uye4
---

New table: lanes(project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, pane_id, status, current_task_bean_id, created_at). PK = (project_key, fleet_milestone_bean_id, epic_bean_id). FK to fleets. Statuses: pending | active | merging | conflict | done. Extends src/storage/db.ts schema.

## Summary of Changes

- Added lanes table to src/storage/db.ts SCHEMA_SQL
- PK = (project_key, fleet_milestone_bean_id, epic_bean_id) — one lane per epic per fleet
- FK to fleets(project_key, milestone_bean_id) — orphan lanes rejected
- Columns: worktree_path, branch, pane_id, status, current_task_bean_id, created_at
- 4 new tests: table exists, columns, FK enforcement, composite PK
