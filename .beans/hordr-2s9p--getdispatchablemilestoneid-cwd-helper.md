---
# hordr-2s9p
title: getDispatchable(milestoneId, cwd) helper
status: completed
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:03:29Z
parent: hordr-hj0i
---

Returns sorted list of dispatchable task beans for the fleet. Two queries: (1) beans query for milestone's descendant tree (flatten children recursively — verify if beans supports recursive descent or needs fixed-depth nesting), (2) beans list --ready --json. Intersect. Sort priority desc then id asc. Isolate in one function so a future scoped-ready query is a one-line swap.

## Summary of Changes

- src/dispatch/dispatch.ts: getDispatchable(milestoneId, {cwd}) + pickDispatchable(descendants, ready)
- Queries milestone's descendant tree via beans query, intersects with beans list --ready, sorts by priority desc then id asc
- Tree flattening handles arbitrary nesting depth (recursive)
- Isolated behind one function so a future scoped-ready beans query is a one-line swap
- Shell seam for testing (mirrors beans/client.ts pattern)
- test/dispatch/dispatch.test.ts: 7 tests (4 pure-logic, 3 mocked-shell)
