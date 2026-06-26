---
# hordr-itiu
title: 'Cleanup: commit signing retry + queue spawn resilience'
status: completed
type: task
priority: high
created_at: 2026-06-26T20:53:33Z
updated_at: 2026-06-26T20:56:44Z
parent: hordr-1t2j
---

## Requirement

Two pre-existing follow-ups from hordr-1006:
1. src/engine/steps/commit.ts fails in environments where git's commit.gpgsign=true and gpg-agent can't unlock. Should try signed, retry without signing on failure.
2. src/engine/queue.ts defaultSpawnSupervisor spawns hordr directly with no HERDR_BIN_PATH awareness and no error handler.

## Spec

1. commit.ts: wrap the git commit call in try/catch. On gpg-signing failure, retry with -c commit.gpgsign=false. Log a warning so the user knows the commit is unsigned.
2. queue.ts: defaultSpawnSupervisor reads HERDR_BIN_PATH ?? hordr; spawn with .on(error, () => {}) to prevent uncaught exceptions.

## Acceptance Criteria

- [ ] commit.ts retries without signing when gpg fails
- [ ] queue.ts honors HERDR_BIN_PATH; spawn errors swallowed
- [ ] All existing tests still pass

## Summary of Changes

- src/engine/steps/commit.ts: wraps git commit in try/catch; on gpg-failure signature in the error, retries with -c commit.gpgsign=false. Warning to stderr. Other errors propagate.
- src/engine/queue.ts: defaultSpawnSupervisor honors HERDR_BIN_PATH env var; child.on('error', () => {}) swallows spawn errors (fire-and-forget semantics — run state already advanced, supervisor pane is UX-only).
- test/engine/steps/commit.test.ts: existing tests now run with commit.gpgsign=false for hermetic isolation. New test: 'retries without signing when gpg fails' verifies the fallback path commits successfully without signature.

278 tests passing (was 274). Build + lint clean.
