---
# hordr-k2o4
title: Guard fetchReady against null beans output
status: completed
type: bug
priority: high
created_at: 2026-08-04T16:43:29Z
updated_at: 2026-08-04T16:49:05Z
---

Lane advance crashes with 'Cannot read properties of null (reading filter)' when beans list --ready --json prints null. Coerce to [] in fetchReady.

## Summary of Changes

- src/dispatch/dispatch.ts: fetchReady now coerces a null beans output to [] instead of returning null (which crashed pickDispatchable's ready.filter with 'Cannot read properties of null').
- test/dispatch/dispatch.test.ts: RED→GREEN test mocking beans list --ready printing literal 'null'.

Verified: dispatch.test.ts 19 pass / 0 fail. The 102 failures elsewhere in the suite are pre-existing (db/ENODT env issues in fleet tests), confirmed by stashing the change and re-running.
