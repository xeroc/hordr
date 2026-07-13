# Per-epic worktrees with lazy creation

**Amends:** ADR-0009 (fleet model) — refines the worktree model from one-shared-worktree to per-epic lanes.

A fleet (milestone-level) does NOT use one shared worktree. Each unblocked **epic** under the milestone gets its own **lane**: a worktree branched from the milestone integration branch, a pane, and a serialized dispatch loop. Lanes are parallel across epics; tasks are serialized within each lane.

## Lazy creation = automatic dependency resolution

Worktrees are created **only when the epic becomes unblocked** — not at fleet create time. The milestone integration branch (`ms/<milestone-id>`, created at fleet create from primary) accumulates completed epics' merged code. When an epic becomes unblocked (its blockers cleared), its worktree branches from the current milestone-branch state, so it **auto-inherits** earlier epics' code. No explicit merge-forward operation — the branch-from-latest IS the merge-forward.

```
fleet create → ms/1 branch from primary
  epic-1 unblocked → worktree from ms/1 → work → merge into ms/1 → teardown
  epic-2 was blocked-by epic-1 → no worktree yet
  epic-1 merges → epic-2 unblocked → worktree from ms/1 (has epic-1's code!) → work → merge → teardown
  epic-3 unblocked (parallel with epic-1) → worktree from ms/1 → work in parallel → merge → teardown
all epics done → fleet finish: merge ms/1 → primary
```

## Two-level merge

| Merge                                      | When                                        | How                      |
| ------------------------------------------ | ------------------------------------------- | ------------------------ |
| Epic branch → milestone integration branch | Epic completes (all tasks done + rolled up) | `gitMergeBranch --no-ff` |
| Milestone integration branch → primary     | All epics merged (fleet finish)             | `gitMergeBranch --no-ff` |

## Merge conflicts: block, don't auto-resolve

If the epic→milestone merge conflicts: the lane enters `conflict` status. `fleet status` shows the conflicted files. The human resolves manually in the epic worktree. The daemon's next tick detects the resolved merge and proceeds. **No agentic conflict resolution** — conflicts need human judgment, and the planner should decompose epics to be independent (disjoint file sets) so conflicts are rare. Agentic resolution is a deferred upgrade if patterns prove predictable.

## Lane lifecycle

```
pending (epic blocked, no worktree)
  → active (worktree created from ms/<id>, dispatch loop running)
    → merging (epic done, merging to ms/<id>)
      → done (merged, worktree removed)
      → conflict (merge conflict, human needed) → done (after human resolves)
```

Lane creation is **tick-driven** (ADR-0010's tick): on each daemon tick, scan for unblocked epics without worktrees and create their lanes. This reuses the existing tick infrastructure (self-heal polling) — one pass handles both health checks and lane creation.

## What this means for the pure-function modules

The modules built under the serialized model are reusable with a one-word scope rename:

| Module                                                 | Change                                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `getDispatchable`                                      | scope param: `epicId` instead of `milestoneId`          |
| `dispatchNext`                                         | context: `{epicId, worktreePath, paneId}`               |
| `rollup`                                               | `fetchAncestry` dep stops at epic level (not milestone) |
| `resolveRole`, `spawnInvocation`, `handleDone`, `heal` | unchanged                                               |

The real new work is in the integration layer: lane lifecycle management, the `lanes` SQLite table, N concurrent dispatch loops, and the two-level merge with conflict detection.

Rationale: per-epic worktrees give the parallelism a team provides (the whole point of a fleet) without sacrificing isolation (each lane is its own git worktree). Lazy creation solves cross-epic dependencies for free. The serialized model was a useful simplification for building the pure-function core; per-epic is the production model that makes a team worth convening.
