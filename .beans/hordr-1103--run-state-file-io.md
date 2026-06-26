---
# hordr-1103
title: Run state file I/O (zod-validated)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:09:30Z
parent: hordr-1001
---

## Requirement

Persist Run state to `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json` with atomic writes and zod validation.

## Spec

Create `src/state/run-store.ts`. Functions: `getRun(beanId)`, `putRun(run)`, `deleteRun(beanId)`, `listRuns(filter?)`. State shape: bean, workflow, step, status, worktree `{workspace_id, branch}`, panes `{role: label}`, started_unix, updated_unix. Write to a temp file then rename (atomic). Validate on every read.

## Acceptance Criteria

- [ ] `putRun` then `getRun` round-trips identical data
- [ ] Corrupt JSON file exits non-zero with the bean id and parse error
- [ ] `listRuns({status: "queued"})` returns only queued Runs
- [ ] Writes are atomic (no partial files on crash)

## Test Plan

Round-trip test. Corruption test (write garbage, verify read fails). Filter test. Atomicity test (kill mid-write, verify no partial file).

## Summary of Changes

- Created src/state/schema.ts (RunStateSchema + RunStatus union: planning|awaiting-approval|queued|running|blocked|pr-open|closed).
- Created src/state/run-store.ts (getRun/putRun/deleteRun/listRuns). STATE_DIR = HERDR_PLUGIN_STATE_DIR ?? cwd/.hordr-state. Atomic write: temp file then fs.renameSync. StateError thrown with 'Run state corrupt for <beanId>: <msg>' on parse/validate failure. putRun auto-stamps started_unix/updated_unix.
- Created src/state/index.ts (re-exports).
- Added 6 mocha tests: round-trip, corruption, status filter, atomicity (no .tmp-* leftovers), delete semantics, missing-dir listRuns.

All 13 project tests passing. Build clean. Lint clean.
