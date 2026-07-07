---
# hordr-8cei
title: Provenance audit (record created_by on dynamic beans)
status: todo
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-a67q
---

When an invocation creates a bean mid-work, record provenance: either a frontmatter field (created_by: <task-id>) or an audit-row entry (invocation spawned bean X). Forensics for tracing cycles/runaway, not a dispatch gate. Decide: frontmatter (visible in beans show) vs SQLite-only audit.
