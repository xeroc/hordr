---
# hordr-fum6
title: 'Lane bootstrap: worktree from ms branch + pane + lane row'
status: completed
type: task
priority: high
created_at: 2026-07-09T09:40:40Z
updated_at: 2026-07-09T09:45:11Z
parent: hordr-7hpb
---

Pure function createLaneForEpic(epic, fleet, deps): create the epic worktree branched from ms/<milestone-id> (the integration branch), ensureLanePane (create pane), addLane row (status=active). Injectable deps: createWorktree, ensureLanePane, addLane. The worktree branch is ms/<ms-id>/<epic-id>. Tests with mocked deps; no real git/herdr in tests.

## Summary of Changes

- `src/dispatch/lane-create.ts`: `createLaneForEpic` — worktree branched FROM ms/<id> (auto-inherits prior epics), `ensureLanePane`, `addLane` row (active); `laneBranchName` = ms/<ms-id>/<epic-id>
- Tests: happy path (worktree base/branch, pane label, lane row), path-absent fallback, branch name

Pure + injectable (createWorktree, createPane, addLane). Composed by tick (hordr-mtmu).
