---
# hordr-1xz6
title: Lane-aware dispatch (N concurrent loops)
status: todo
type: task
priority: high
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-uye4
---

The daemon runs one serialized dispatch loop per active lane (one task at a time per epic, parallel across epics). Each loop calls getDispatchable(epicId) → dispatchNext → wait → rollup → repeat. N loops on the Node event loop, each with its own timer. Lane state tracks current_task_bean_id so /done routes to the right lane.
