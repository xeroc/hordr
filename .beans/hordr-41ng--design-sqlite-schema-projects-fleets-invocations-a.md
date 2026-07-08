---
# hordr-41ng
title: Design SQLite schema (projects, fleets, invocations, audit)
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:52:01Z
parent: hordr-plce
---

Tables per ADR-0012. projects(project_key PK, config_path, beans_path, company_path, registered_at). fleets(project_key FK, milestone_bean_id, worktree_path, branch, status, created_at; PK composite). invocations(project_key, fleet_milestone_bean_id, task_bean_id, role, pane_id, started_at, ended_at, commit_sha). Use INTEGER autoincrement where natural; composite keys where the parent id is the natural key.

## Summary of Changes

- src/storage/db.ts: openDb (PRAGMA foreign_keys=ON, busy_timeout=5000) + applySchema (idempotent CREATE TABLE IF NOT EXISTS)
- Tables: projects(project_key PK), fleets(composite PK project_key+milestone_bean_id, FK to projects), invocations(autoincrement PK, audit row)
- test/storage/db.test.ts: 8 tests covering pragmas, table creation, idempotency, FK enforcement, composite PK, column shape
