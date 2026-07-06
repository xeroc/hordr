---
# hordr-ozi6
title: Add hordr finish command
status: completed
type: feature
priority: high
created_at: 2026-07-06T06:24:34Z
updated_at: 2026-07-06T06:33:15Z
---

Add a single command that: (1) confirms bean is completed via beans CLI, (2) merges the bean worktree branch into primary via git, (3) removes the worktree via herdr.

- [x] Write failing test for finish command (RED)
- [x] Implement finish command (GREEN)
- [x] Add README mention
- [x] Run lint + typecheck + tests

## Summary of Changes

- Added `src/commands/finish.ts` — oclif command: asserts bean status==='completed', runs `git checkout <primary> && git merge bean/<id>`, then opens + removes the worktree (tolerant if already gone).
- Exported `gitMergeBranch(primary, branch, cwd)` from `src/runtime.ts` — reuses the existing mockable `_gitRunner` seam.
- Added `test/commands/finish.test.ts` (5 tests, all passing) covering happy path, not-completed refusal, --json, tolerant-remove when worktree missing, and missing-arg error.
- README: added finish to command table + a flags subsection.

Pre-existing unrelated failure: `test/harness/launcher.test.ts` expects `opencode --mini` but `src/harness/launcher.ts:92` still calls ` run ...` despite commit e6e9e1b claiming otherwise. Not touched (surgical).
