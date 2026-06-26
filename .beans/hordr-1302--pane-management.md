---
# hordr-1302
title: Pane management (split, run, label, resolve-by-label)
status: todo
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T00:00:00Z
parent: hordr-1003
order: C2
---

## Requirement

Spawn, label, find, and run commands in herdr panes. Labels survive pane-id compaction.

## Spec

Create `src/herdr/pane.ts`. Functions: `splitLabeled({workspaceId, label, direction?, cwd?})` → splits a pane, sets label via `herdr pane rename`, returns pane info. `findPane(workspaceId, label)` → filters `herdr pane list` by label prefix `hordr:`. `runInPane(paneId, command)`. `readPane(paneId, lines)`. Label format: `hordr:<bean-id>:<role>`.

## Acceptance Criteria

- [ ] `splitLabeled` creates a pane with the given label
- [ ] `findPane` returns the pane by label after a compaction event
- [ ] `findPane` returns null if no pane with that label exists
- [ ] `runInPane` sends text + Enter

## Test Plan

Integration: split labeled pane, read it back, close it, verify findPane returns null. Simulate compaction by closing a pane between two others and re-finding.
