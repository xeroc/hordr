---
# hordr-8cei
title: Provenance audit (record created_by on dynamic beans)
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T08:27:03Z
parent: hordr-a67q
---

When an invocation creates a bean mid-work, record provenance: either a frontmatter field (created_by: <task-id>) or an audit-row entry (invocation spawned bean X). Forensics for tracing cycles/runaway, not a dispatch gate. Decide: frontmatter (visible in beans show) vs SQLite-only audit.

## Summary of Changes

- `src/storage/db.ts`: `bean_provenance` table (project_key, fleet, created_by_task_bean_id, spawned_bean_id, recorded_at; PK project_key+spawned_bean_id)
- `src/storage/fleets.ts`: `recordProvenance` (idempotent — keeps first creator), `listProvenance` (per fleet), `provenanceFor` (single bean)
- Tests: schema table + idempotency at the SQL level; CRUD round-trip + idempotency at the repository level

Decision: SQLite-only audit (not frontmatter). Hordr is read-only on beans (AGENTS.md), so a frontmatter created_by would need agent compliance + a beans write path. The audit table is hordr-owned, reliable forensics — not a dispatch gate. The daemon records entries when it detects beans spawned during an invocation.
