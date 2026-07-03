---
# hordr-7jla
title: 'Slice 7: hordr resume command'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:30Z
updated_at: 2026-07-01T13:36:34Z
parent: hordr-4j5j
---

Slice 7: hordr resume command

## Summary

- src/commands/resume.ts: new command. Errors if not blocked. Proxies to daemon /resume, falls back to engine.resume direct.
- test/commands/resume.test.ts: 4 tests covering happy path, --json, non-blocked error, missing run.
