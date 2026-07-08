---
# hordr-iubj
title: Ephemeral invocation spawn (herdr pane run + harness)
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:09:22Z
parent: hordr-hj0i
---

Spawn the agent: herdr pane run <fleet-pane> with cwd=worktree, command = '<harness> run --interactive <quoted prompt>'. Prompt = persona(role) + bean body + 'when done: commit, beans update <id> -s completed, hordr done <id>'. Harness from company.agents[role].harness (mixed backends per role fall out).

## Summary of Changes

- src/dispatch/spawn.ts: buildInvocationPrompt (persona + bean body + hordr-done instructions) + spawnInvocation (runInPane with harness)
- Reuses shellQuote from harness/launcher.ts for prompt quoting
- Prompt includes: 'beans update <id> -s completed', 'commit skill', 'hordr done <id>', 'Then stop'
- test/dispatch/spawn.test.ts: 4 tests
