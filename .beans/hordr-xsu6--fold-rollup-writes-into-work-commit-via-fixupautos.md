---
# hordr-xsu6
title: Fold rollup writes into work commit via fixup+autosquash (ADR-0011)
status: draft
type: task
priority: normal
created_at: 2026-07-09T10:53:11Z
updated_at: 2026-07-09T10:53:11Z
parent: hordr-7hpb
---

ADR-0011 specifies the /done handler does rollup synchronously and folds the status writes into the member's work commit via `git commit --fixup=<work-sha>` + `git rebase -i --autosquash` (squash.ts exists, unwired). Currently rollup happens in the tick's advanceLane 'proceed' branch (status propagates, but as separate/uncommitted writes, not folded into the work commit). Wire: (1) /done handler triggers rollup synchronously after verifying completion, (2) squashRollup folds the .beans/ writes into the work commit using the invocation's work-sha. Needs the work commit SHA (from invocation audit or git log) + the worktree cwd. Deferred from hordr-rnq9.
