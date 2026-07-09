---
# hordr-e34t
title: 'Draft-gating: verify dispatch excludes draft + persona convention'
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T08:22:15Z
parent: hordr-a67q
---

Confirm beans list --ready excludes draft (per AGENTS.md). Document in personas the convention: members create with beans create ... -s draft. No hordr governance code — the gate is beans' ready-filter. Add a test that a draft bean is never dispatched.

## Summary of Changes

- `test/dispatch/dispatch.test.ts`: test pinning the invariant that a draft bean is never dispatched (descendants ∩ ready excludes drafts — the gate is beans' --ready filter, no hordr governance code)
- `src/config/defaults.ts`: implementer persona now documents the dynamic-bean convention: create with `beans create ... -s draft` (drafts await human review, never auto-dispatched)

Confirmed: beans list --ready excludes draft, so pickDispatchable (descendants ∩ ready) never selects a draft.
