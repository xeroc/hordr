---
# hordr-1405
title: '`close-merged` scanner'
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T10:20:57Z
parent: hordr-1004
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

## Summary of Changes

- src/engine/close-merged.ts: closeMerged(deps) -> {closed, skipped, failed}.
- For each pr-open run: gh pr view --json state,mergedAt --branch <worktree.branch>. MERGED -> beans.setStatus completed + deps.removeWorktree + transition closed. OPEN -> skipped. gh failure -> failed (continue).
- gh missing -> throws CloseMergedError('gh CLI not found on PATH') (pre-checked once).
- gh shell fn injectable for tests via _setGhForTesting/_resetGh seam.
