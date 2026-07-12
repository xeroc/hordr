---
# hordr-dml1
title: Daemon foreground mode (--foreground flag)
status: todo
type: task
priority: high
created_at: 2026-07-12T19:24:46Z
updated_at: 2026-07-12T19:24:46Z
parent: hordr-ikft
---

Add --foreground flag to hordr daemon. Default: detached (background, stdio ignored). With --foreground: stays in terminal, logs visible. Existing behavior (detached via ensureDaemon) stays the default for fleet create auto-start.
