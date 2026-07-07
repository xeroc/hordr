---
# hordr-41ng
title: Design SQLite schema (projects, fleets, invocations, audit)
status: todo
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-plce
---

Tables per ADR-0012. projects(project_key PK, config_path, beans_path, company_path, registered_at). fleets(project_key FK, milestone_bean_id, worktree_path, branch, status, created_at; PK composite). invocations(project_key, fleet_milestone_bean_id, task_bean_id, role, pane_id, started_at, ended_at, commit_sha). Use INTEGER autoincrement where natural; composite keys where the parent id is the natural key.
