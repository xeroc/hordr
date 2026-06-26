---
# hordr-1401
title: Run state machine (transitions + zod schema)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1004
order: D1
---

## Requirement

Define the Run state machine: states, valid transitions, and the state schema.

## Spec

Create `src/engine/run.ts`. States: `planning`, `awaiting-approval`, `queued`, `running`, `blocked`, `pr-open`, `closed`. Define a transition table (which state → which state is valid). Function `transition(run, newState)` validates the transition, throws on invalid. Update `updated_unix` on every transition. The Run schema is a zod object (extends the state store schema with engine fields).

## Acceptance Criteria

- [ ] All states from SPEC.md §3 are represented
- [ ] `transition(run, "running")` from `queued` succeeds
- [ ] `transition(run, "closed")` from `running` throws (must go through pr-open)
- [ ] Invalid transitions produce a clear error naming both states

## Test Plan

Table-driven: every valid transition succeeds. Every invalid transition throws. Verify `updated_unix` bumps.
