---
# hordr-trci
title: 'Slice 1: RunState schema - block_reason + panes keyed by step'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:21Z
updated_at: 2026-07-01T13:00:20Z
parent: hordr-4j5j
---

Add optional block_reason?: string to RunStateSchema. Document panes as keyed by step index (string). Keep pane_step optional (vestigial).

## Summary of Changes

- src/state/schema.ts: added optional block_reason field; documented panes keyed by step index; pane_step left optional (vestigial).
- test/state/run-store.test.ts: round-trip test for block_reason.
