---
# hordr-9zup
title: Replace /health-only router with extensible route dispatch
status: todo
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-ikft
---

daemon/server.ts currently hardcodes /health. Generalize: method+path → handler map, JSON in/out, unknown → 404. Keep /health working. Every route receives the project_key (resolved by CLI, sent as a field/header).
