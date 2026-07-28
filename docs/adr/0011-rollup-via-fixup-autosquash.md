# Broker-owned rollup via fixup + autosquash

**Amended:** 2026-07-08 — rollup scope changed to epic-level (stops at epic, not milestone) under the per-epic model (ADR-0014). Milestone-level completion is a separate fleet-level check after all epic merges.

**Amended:** 2026-07-13 — the fixup + autosquash folding was never wired. The rollup's `.beans` status writes are now committed via a plain `commitBeans` (git add + git commit) after the ancestry walk. The ancestry-walk-and-mark rollup itself (`rollup.ts`) stands; only the squash step is gone. The code below is retained as the historical decision record.

**Amended:** 2026-07-17 — the rollup commit is now idempotent and defensive. `commitBeanChanges` (in `src/dispatch/commit-beans.ts`, a pure dep-injected function) skips the commit when nothing is staged (`git diff --cached --quiet` exit 0), so it can be called unconditionally after every rollup attempt AND defensively inside `mergeEpicLane`/`finishFleet` right before worktree removal. This closes a stuck-lane bug (hordr-hmbq) where a previously-skipped or failed rollup commit left `.beans/` dirt that `git worktree remove` (no `--force`) refused.

When a task bean flips to `completed`, status must propagate upward: an epic/feature/milestone is `completed` only when **all** its descendants are. The daemon owns this rollup deterministically — not the member, not a planner agent. Rollup is a pure function of the bean tree; spending a model call on it is waste, and trusting every role's persona to walk ancestry correctly is fragile.

The `/done` handler, after verifying the task is `completed` and the working tree is clean, walks the task's ancestry (via `beans query`) in the worktree. For each ancestor whose subtree is now all-completed, it runs `beans update <ancestor> -s completed --cwd <worktree>`. Each bean is its own `.md` file, so the rollup writes never conflict with the member's work-commit files.

The rollup writes are then folded into the member's just-made work commit, preserving the **one task = one commit** invariant:

```bash
git add .beans/ --cwd <wt>
git commit --fixup=<work-commit-sha> --cwd <wt>
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <work-commit-sha>~1 --cwd <wt>
```

`fixup` + `autosquash` is preferred over `--amend` because `--fixup=<sha>` targets the specific commit even if something else landed on HEAD between the member's commit and the broker's rollup — robust to non-HEAD targets, at the cost of one extra operation. When no ancestor transitions (the common case), no fixup commit is made and no rebase runs — the work commit stands alone.

Rationale: rooting the rollup in the broker (not the agent) keeps role personas short and uniform — no role needs to understand bean-tree traversal. Folding the rollup into the work commit via autosquash keeps history literal: each task is exactly one commit carrying both the work and its status consequences, and the milestone's `--no-ff` merge (ADR: fleet finish) groups them cleanly on `develop`. The SHA-rewrite implication is handled by recording the **post-squash** HEAD against the task in the audit log, not the SHA the member originally committed.
