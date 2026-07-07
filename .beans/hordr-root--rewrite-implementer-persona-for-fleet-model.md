---
# hordr-root
title: Rewrite implementer persona for fleet model
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:18Z
updated_at: 2026-07-07T21:30:06Z
parent: hordr-tp3n
---

Replace the v3 tree-walking implementer persona (tributary-bean.yaml style) with the fleet-shaped one: 'You implement ONE task bean assigned to you. Do only that task. When done: beans update -s completed, commit, hordr done <id>. Then stop.' No descendant enumeration, no rollup (broker owns it).

## Summary of Changes

Fleet-shaped implementer persona in docs/fleet-guide.md — replaces the v3 tree-walking persona with: read assigned bean, do ONLY that task, commit, hordr done, stop.
