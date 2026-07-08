---
# hordr-gs8v
title: Rewrite reviewer persona for fleet model
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:18Z
updated_at: 2026-07-07T21:30:06Z
parent: hordr-tp3n
---

Reviewer gets one assigned review-task bean, reviews the diff in the shared worktree, marks completed, hordr done. No tree traversal. (Exact review semantics — diff against milestone branch base? against develop? — to be specified when this task is picked up.)

## Summary of Changes

Fleet-shaped reviewer + tester personas in docs/fleet-guide.md — one-bean-at-a-time review/test workflows with the same commit + hordr done pattern.
