---
# hordr-tmpv
title: hordr fleet finish <milestone-id>
status: completed
type: task
priority: high
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T08:08:00Z
parent: hordr-t3wf
---

Assert milestone bean status==completed (rollup must have closed it). gitMergeBranch --no-ff milestone/<id> into primary (reuse existing runtime.gitMergeBranch). Tear down worktree + fleet row. Refuse if milestone not complete.



## Per-epic model update (grilling session)

fleet finish now: (1) assert ALL epics are done (merged into milestone branch), (2) assert milestone bean is completed, (3) merge ms/<id> into primary via --no-ff, (4) tear down all remaining worktrees + fleet row. Refuses if any epic is not yet merged.

## Summary of Changes

- `src/dispatch/dispatch.ts`: `fetchChildStatuses(beanId)` — milestone→epic statuses via beans query
- `src/fleet/lifecycle.ts`: `finishFleet` — asserts milestone completed (isMilestoneComplete) + all epics completed (areAllEpicsCompleted), merges ms/<id>→primary (--no-ff), deletes lane + fleet rows; refuses if incomplete, throws on merge conflict (keeps row)
- `src/commands/fleet/finish.ts`: `hordr fleet finish <milestone-id>` [--base] [--json]
- Tests: finishFleet lifecycle (happy + 3 refusal + conflict), command end-to-end

Worktrees torn down by daemon at epic-merge time (lane→done); finish only drops rows.
