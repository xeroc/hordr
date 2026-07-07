---
# hordr-1xjt
title: Pane reuse per fleet (one stable pane, sequential invocations)
status: todo
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-hj0i
---

On first dispatch for a fleet, create a pane in the worktree's tab. Reuse it for every subsequent invocation (herdr pane run into the existing pane after the prior opencode exits). Between tasks the pane is briefly at a shell prompt. Verify shell-state leakage doesn't corrupt the next opencode session.
