---
# hordr-gdqm
title: Agent lifecycle API + heal
status: scrapped
type: epic
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-vouv
---

Foundational layer: the `agent.ts` wrapper module, config schema changes, and lifecycle-aware heal rewrite. Everything downstream depends on this epic.

Tasks:
1. `src/herdr/agent.ts` — wrapper module with test seams
2. Config: add `kind` + `auto_approve` fields to AgentDefSchema
3. `heal.ts`: replace binary `agentActiveInPane` with lifecycle-aware probe
4. `engine.ts` advanceLane: handle `blocked`/`idle`/`done` lifecycle states
