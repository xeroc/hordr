---
# hordr-2s9p
title: getDispatchable(milestoneId, cwd) helper
status: todo
type: task
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-hj0i
---

Returns sorted list of dispatchable task beans for the fleet. Two queries: (1) beans query for milestone's descendant tree (flatten children recursively — verify if beans supports recursive descent or needs fixed-depth nesting), (2) beans list --ready --json. Intersect. Sort priority desc then id asc. Isolate in one function so a future scoped-ready query is a one-line swap.
