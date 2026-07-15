---
# hordr-0et3
title: 'Fix mergeBranch: always checkout target before merging'
status: completed
type: bug
priority: critical
created_at: 2026-07-15T15:08:07Z
updated_at: 2026-07-15T15:08:07Z
---

The fast path in mergeBranch tried git merge without checking out the target branch first. When cwd was the ms worktree (on the ms branch), merging the ms branch into itself was a silent no-op. Fix: removed the fast path, always stash checkout target merge restore.
