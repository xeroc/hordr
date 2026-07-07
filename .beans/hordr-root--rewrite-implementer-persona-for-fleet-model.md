---
# hordr-root
title: Rewrite implementer persona for fleet model
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:18Z
updated_at: 2026-07-07T20:31:18Z
parent: hordr-tp3n
---

Replace the v3 tree-walking implementer persona (tributary-bean.yaml style) with the fleet-shaped one: 'You implement ONE task bean assigned to you. Do only that task. When done: beans update -s completed, commit, hordr done <id>. Then stop.' No descendant enumeration, no rollup (broker owns it).
