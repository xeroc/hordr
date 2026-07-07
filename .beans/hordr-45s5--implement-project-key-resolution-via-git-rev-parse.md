---
# hordr-45s5
title: Implement project-key resolution via git rev-parse --git-common-dir
status: todo
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-07T20:31:17Z
parent: hordr-plce
---

CLI helper that resolves the project key from cwd by shelling out to git rev-parse --git-common-dir. Must be stable across worktrees of one clone and differ across clones (verify in tests). Used by every CLI command to scope daemon messages.
