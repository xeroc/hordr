---
# hordr-sjue
title: FleetEngine refactor — deepen the dispatch core
status: completed
type: milestone
priority: high
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T10:17:42Z
---

Architecture review identified that the dispatch core has 17-field dep interfaces forwarded through pass-through layers, 6 dead/shallow modules, duplicated types, and 8 global test seams. Every shipped bug lived in the wiring layer, not the pure functions. This milestone deepens the architecture: one FleetEngine module with a small interface, dead code removed, types unified.
