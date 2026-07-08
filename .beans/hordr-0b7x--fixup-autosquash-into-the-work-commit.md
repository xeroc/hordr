---
# hordr-0b7x
title: fixup + autosquash into the work commit
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T21:26:06Z
parent: hordr-nj9r
---

After rollup writes dirty .beans/: git add .beans/, git commit --fixup=<work-commit-sha>, GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <work-commit-sha>~1. All --cwd worktree. Skip entirely if no ancestor transitioned (common case). Record post-squash HEAD sha in audit (not the member's original sha).

## Summary of Changes

- src/dispatch/squash.ts: squashRollup(opts, deps) — 3 git ops (add, commit --fixup, rebase --autosquash)
- sequence.editor=: makes interactive rebase non-interactive (equivalent to GIT_SEQUENCE_EDITOR=true)
- All ops cwd-scoped to worktree
- Pure function with injected git dep (GitFn = (args, {cwd}) => void)
- test/dispatch/squash.test.ts: 2 tests (call order + args, cwd usage)
