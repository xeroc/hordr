---
title: "`close-merged` scanner"
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1004
order: D5
---

## Requirement

Detect which `pr-open` Runs have had their PR merged on GitHub, then finalize: bean → `completed`, worktree removed.

## Spec

Create `src/engine/close-merged.ts`. For each Run with `status: pr-open`: run `gh pr view --json state,mergedAt --branch <worktree-branch>`. If `state == "MERGED"`: `beans setStatus(bean, "completed")` on `develop`, commit, `herdr worktree remove`. If `gh` fails (auth, not found): skip and warn.

## Acceptance Criteria

- [ ] Merged PR → bean status `completed`, worktree removed, Run `closed`
- [ ] Open PR → Run stays `pr-open`, skipped
- [ ] `gh` not available → warns, skips all, exits non-zero
- [ ] No `pr-open` Runs → prints "nothing to close", exits 0

## Test Plan

Mock `gh` output for merged/open/not-found. Verify correct transitions. Test with zero pr-open Runs.
