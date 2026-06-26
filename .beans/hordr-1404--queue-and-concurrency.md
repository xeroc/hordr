---
# hordr-1404
title: Queue + concurrency enforcement + drain
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:20:57Z
parent: hordr-1004
---

## Requirement

Enforce `hordr.concurrency`. Overflow goes to queue. `drain` starts queued Runs until the limit.

## Spec

Create `src/engine/queue.ts`. `activeCount()` = number of Runs in `running` or `blocked`. `enqueue(beanId)` = if `activeCount < concurrency`, transition to `running` and spawn supervisor; else set Run to `queued`. `drain()` = while `activeCount < concurrency` and queue non-empty: dequeue oldest, transition to `running`, spawn supervisor.

## Acceptance Criteria

- [ ] `enqueue` when under limit starts the Run immediately
- [ ] `enqueue` at limit sets Run to `queued`
- [ ] `drain` starts queued Runs in FIFO order until limit reached
- [ ] Concurrency value of 0 or negative is rejected at config validation time

## Test Plan

Unit test with concurrency=2: enqueue 3 beans, verify 2 running + 1 queued. Drain after one completes, verify the queued one starts.

## Summary of Changes

- src/engine/queue.ts: activeCount(), capacity(), enqueue(beanId, deps, spawn=defaultSpawnSupervisor), drain(deps, spawn=defaultSpawnSupervisor).
- activeCount = runs with status running|blocked. capacity = loadConfig().concurrency (already positive-validated by zod in hordr-1102).
- enqueue: under capacity -> transition running + spawn supervisor; at capacity -> transition queued.
- drain: FIFO by started_unix until capacity reached or queue empty.
- spawn fn injectable for tests; default impl fire-and-forget execFileSync('hordr', ['supervise', beanId], {detached, stdio:'ignore'}).unref().
