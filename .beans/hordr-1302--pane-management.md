---
# hordr-1302
title: Pane management (split, run, label, resolve-by-label)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T15:16:42Z
parent: hordr-1003
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

## Summary of Changes

- src/herdr/pane.ts: splitPane, splitLabeled, renamePane, findPane, runInPane, sendText, readPane, closePane + paneLabel(beanId, role) helper.
- All wrap real herdr CLI subcommands (verified surface): pane split/get/rename/send-text/send-keys/read/run/close.
- HerdrError on JSON error envelopes.

**Reinterpretation (documented in file header):** herdr v0.7.0 pane list/get do NOT surface labels. The AC 'findPane by label' is impossible against current CLI. Reimplemented as findPane(workspaceId, paneId) -> validates pane liveness via pane get, returns PaneInfo or null on pane_not_found. hordr must track pane_ids in Run state (the existing run.panes field), not labels. Labels still set via pane rename for human UX. hordr-1006 will need to thread pane_ids through EngineDeps calls (existing paneLabel params are semantically pane_ids).

**Second deviation:** pane split has no --workspace flag in help; parentPaneId is the selector (its wJ: prefix carries workspace implicitly). PaneSplitOpts.parentPaneId required.

- 19 tests covering all ACs + deviations.
