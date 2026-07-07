---
# hordr-z0ai
title: Implement bean-status self-heal poll
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-ikft
---

Per-tick (default 5s): for the current fleet's active invocation, check bean status in the worktree. If completed without /done → proceed as if /done arrived. Also check pane-gone (herdr pane get); if gone AND bean not completed → mark task blocked, continue. No wall-clock timeouts ever.
