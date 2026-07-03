---
# hordr-4j5j
title: Daemon mode + new-pane-per-advance + agent self-report
status: todo
type: milestone
priority: high
created_at: 2026-07-01T12:58:09Z
updated_at: 2026-07-01T12:58:09Z
---

Reverse ADR-0004: hordr runs as a daemon (unix socket HTTP/JSON). Agents self-report completion/failure via curl. Each step gets a fresh pane; old panes preserved.
