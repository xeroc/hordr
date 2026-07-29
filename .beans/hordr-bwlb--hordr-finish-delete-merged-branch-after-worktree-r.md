---
# hordr-bwlb
title: 'hordr finish: delete merged branch after worktree removal'
status: completed
type: bug
priority: high
created_at: 2026-07-29T06:13:50Z
updated_at: 2026-07-29T06:21:21Z
---

Single-bean 'hordr finish' removes the worktree but leaves the bean branch (hordr-<id>) dangling. Fleet teardown already deletes with 'git branch -d' (safe, not -D). Mirror that in finish: after removeWorktree, run 'git branch -d <branch>' from cwd. Tolerant (warn+continue) like finishLaneTeardown/finishFleetTeardown. Scope: src/commands/finish.ts only.

## Summary of Changes

- RED: extended test/commands/finish.test.ts (happy path now expects 3 git calls incl. ['branch','-d',branch]; --json asserts branchDeleted; 'already gone' path still deletes branch; new test: branch -d failure is tolerated with this.warn + branchDeleted=false). Added runtime.test.ts cover for gitDeleteBranch (-d, never -D; error propagates).
- GREEN: src/runtime.ts — added gitDeleteBranch(branch, cwd) using _gitRunner seam (safe -d, never -D; throws on refusal).
- src/commands/finish.ts — after removeWorktree, calls gitDeleteBranch in try/catch; tracks branchDeleted; this.warn on failure (non-fatal, mirrors finishLaneTeardown/finishFleetTeardown). JSON gains branchDeleted; human log line appends ', deleted branch <id>'. Updated docstring + static description.
- Verified: 320 passing; the single failing dispatch/spawn test is pre-existing (fails on clean develop). lint 0 errors; typecheck clean.

Out of scope: fleet teardown paths already deleted with -d (no change needed). hordr cleanup intentionally leaves the branch for the human (unchanged).
