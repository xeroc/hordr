---
# hordr-oajg
title: 'Role/persona resolution from bean assigned: field'
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-hj0i
---

Read the dispatched bean's assigned: frontmatter field. Look up company.agents[assigned].persona + .harness. If assigned: missing → default to config hordr.dispatch.default_role (implementer) with warning. If assigned: unresolvable (role not in company) → mark bean blocked, skip to next ready (don't stall fleet).
