---
# hordr-iubj
title: Ephemeral invocation spawn (herdr pane run + harness)
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-hj0i
---

Spawn the agent: herdr pane run <fleet-pane> with cwd=worktree, command = '<harness> run --interactive <quoted prompt>'. Prompt = persona(role) + bean body + 'when done: commit, beans update <id> -s completed, hordr done <id>'. Harness from company.agents[role].harness (mixed backends per role fall out).
