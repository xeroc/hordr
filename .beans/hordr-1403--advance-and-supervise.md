---
# hordr-1403
title: Idempotent `advance` and blocking `supervise` loop
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1004
order: D3
---

## Requirement

`advance` executes exactly one step and persists state. `supervise` loops advance until terminal or blocked.

## Spec

Create `src/engine/advance.ts`. `advance(beanId)`: read Run → look up workflow → find current step → call handler → apply patch → persist → return result. Create `src/engine/supervise.ts`. `supervise(beanId)`: `while (true) { const r = advance(beanId); if (r.terminal || r.blocked) break; await sleep(pollMs); }`. Designed to run inside a herdr supervisor pane.

## Acceptance Criteria

- [ ] `advance` moves the Run exactly one step forward
- [ ] `advance` on a blocked Run is a no-op (returns current state)
- [ ] `advance` on a closed Run is a no-op
- [ ] `supervise` exits when Run reaches `pr-open` (external HITL)
- [ ] `supervise` exits when Run reaches `blocked`

## Test Plan

Unit test advance with mocked handlers. Test the supervise loop exits on terminal and blocked states. Test resume: advance to step 3, kill, advance again, verify step 4.
