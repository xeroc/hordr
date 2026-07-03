---
# hordr-b0lm
title: 'Slice 5: Prompt injection - bake curl --unix-socket lines'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:30Z
updated_at: 2026-07-01T13:26:35Z
parent: hordr-4j5j
---

Slice 5: Prompt injection - bake curl --unix-socket lines

## Summary

- src/harness/launcher.ts: buildPrompt now bakes in curl --unix-socket commands for /complete and /fail, plus the absolute socket path and explicit 'stop and wait for human' instruction.
- test/harness/launcher.test.ts: buildPrompt test asserts all daemon wiring present.
