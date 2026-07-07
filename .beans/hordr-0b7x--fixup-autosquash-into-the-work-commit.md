---
# hordr-0b7x
title: fixup + autosquash into the work commit
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-nj9r
---

After rollup writes dirty .beans/: git add .beans/, git commit --fixup=<work-commit-sha>, GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <work-commit-sha>~1. All --cwd worktree. Skip entirely if no ancestor transitioned (common case). Record post-squash HEAD sha in audit (not the member's original sha).
