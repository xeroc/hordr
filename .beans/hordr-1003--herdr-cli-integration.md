---
# hordr-1003
title: Herdr CLI integration
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T15:17:08Z
---

Wrap the herdr CLI (`HERDR_BIN_PATH`) for worktree lifecycle, pane management, pane labeling, wait helpers, and notifications.

## Requirement

Hordr drives worktrees, panes, and waits through herdr's socket API via the CLI wrapper. Panes must be labeled with `hordr:<bean-id>:<role>` and resolvable by label (pane ids compact on close).

## Spec

All herdr calls go through `HERDR_BIN_PATH` for portability. Pane label resolution filters `herdr pane list` output by the `hordr:` prefix label. Wait helpers wrap `herdr wait output` and `herdr wait agent-status`.

## Acceptance Criteria

- [x] createWorktree/openWorktree/removeWorktree wrap real herdr CLI (hordr-1301)
- [x] splitLabeled + runInPane (hordr-1302)
- [x] REINTERPRETED: findPane(workspaceId, paneId) — herdr v0.7.0 cannot query labels (verified); hordr tracks pane_ids in Run state instead (hordr-1302)
- [x] waitOutput wraps herdr wait output --regex --timeout (hordr-1303)
- [x] waitAgentStatus wraps herdr wait agent-status --timeout (hordr-1303)
- [x] notify wraps herdr notification show (hordr-1303)

## Test Plan

Integration test inside a running herdr session: create workspace, split labeled pane, send text, read it back, find by label. Unit test the label parsing logic.

## Summary of Changes

Epic delivered via 3 parallel child tasks, all wrapping the REAL herdr v0.7.0 CLI (probed before design):
- hordr-1301 (worktree): createWorktree/openWorktree/removeWorktree + branchFor. Parses JSON-RPC envelopes, throws HerdrError on errors.
- hordr-1302 (pane): splitPane/splitLabeled/renamePane/findPane/runInPane/sendText/readPane/closePane + paneLabel helper.
- hordr-1303 (wait+notify): waitOutput/waitAgentStatus with HerdrWaitTimeout subclass; notify wrapper.

Barrel at src/herdr/index.ts.

**Key finding (resolve the label-resolution mystery from hordr-1502):** herdr v0.7.0 pane list/get do NOT surface pane labels — only pane_id, agent, agent_status, cwd, workspace_id, tab_id. Labels CAN be set via pane rename but CANNOT be queried. Therefore:
- SPEC/CONTEXT's 'resolve panes by label' is aspirational, not implementable today.
- Hordr must track pane_ids in Run state (existing run.panes field) — they survive sibling compaction via the workspace-prefixed format (wJ:p2).
- Labels are still set via pane rename for human UX in herdr's TUI.
- findPane(workspaceId, paneId) validates liveness via pane get; returns null on pane_not_found.

This requires hordr-1006 to thread pane_ids (not labels) through EngineDeps calls — the existing 'paneLabel' params in src/engine/types.ts and src/harness/launcher.ts are semantically pane_ids; the name is misleading but the type (string) is right.

All 204 tests passing. Build + lint clean.
