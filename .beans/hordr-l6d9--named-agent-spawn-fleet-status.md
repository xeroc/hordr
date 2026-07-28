---
# hordr-l6d9
title: Named agent spawn + fleet status
status: scrapped
type: epic
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-vouv
blocked_by:
    - hordr-gdqm
---

Migrate the spawn path from fire-and-forget `pane run` to tracked `agent start` + `agent prompt`. Update pane-heal to reattach by agent name. Show lifecycle state in fleet status.

Depends on Epic 1 (agent.ts wrapper + config kind field).
