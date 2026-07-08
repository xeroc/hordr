---
# hordr-uye4
title: Lane management (per-epic worktrees)
status: todo
type: epic
priority: critical
created_at: 2026-07-08T08:44:00Z
updated_at: 2026-07-08T08:44:00Z
parent: hordr-nh1h
---

Per-epic parallelism within a fleet (ADR-0014). Lanes are epic-scoped worktrees created lazily when the epic becomes unblocked. Each lane runs a serialized dispatch loop; lanes are parallel across epics. Worktrees branch from the milestone integration branch so later epics auto-inherit earlier epics' merged code.
