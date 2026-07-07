---
# hordr-oajg
title: 'Role/persona resolution from bean assigned: field'
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:06:01Z
parent: hordr-hj0i
---

Read the dispatched bean's assigned: frontmatter field. Look up company.agents[assigned].persona + .harness. If assigned: missing → default to config hordr.dispatch.default_role (implementer) with warning. If assigned: unresolvable (role not in company) → mark bean blocked, skip to next ready (don't stall fleet).

## Summary of Changes

- src/dispatch/role.ts: resolveRole(bean, config) → {role, harness, persona}
- Reads assigned: frontmatter field (passthrough on BeanRecord); defaults to 'implementer'
- Throws DispatchError if role not in config.agents
- Mixed harness per role falls out (opencode/claude/codex)
- test/dispatch/role.test.ts: 5 tests
