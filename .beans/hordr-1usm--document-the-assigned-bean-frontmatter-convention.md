---
# hordr-1usm
title: 'Document the assigned: bean frontmatter convention'
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:18Z
updated_at: 2026-07-07T21:30:06Z
parent: hordr-tp3n
---

The planner writes assigned: <role-slug> on every task/bug bean during the external planning grilling. This field is the dispatch contract. Document it in the hordr docs/beans-conventions or equivalent, with examples per role. Note: this is a NEW bean frontmatter field (not native to beans CLI) — specify how it's authored (manual frontmatter, or a beans update --flag if beans grows one).

## Summary of Changes

Documented the assigned: frontmatter convention in docs/fleet-guide.md — how the planner sets it, how the daemon reads it, missing/unresuable handling, and dynamic-bean expectations.
