---
# hordr-khga
title: Single-pane-per-run model (reused across roles)
status: completed
type: feature
priority: high
created_at: 2026-06-29T19:26:59Z
updated_at: 2026-06-29T19:36:50Z
---

Refactor launchOrReuse to use one pane per Run (panes.primary), reused across agent roles. Drop the per-role pane map. Add pane_step to RunState so completion-detection distinguishes 'pane is running current step' (advance callback = done) from 'pane exists but step mismatched' (spawn for new step).



## Plan

- [ ] RED: launchOrReuse uses panes.primary + pane_step signal; update advance tests for single-pane
- [ ] GREEN: add pane_step to RunState schema
- [ ] GREEN: rewrite launchOrReuse to single-pane model
- [ ] GREEN: update agent.ts to use paneStep signal
- [x] full suite + lint + typecheck (141 passing, lint below baseline, e2e verified)



## Summary of Changes

### Model
One Run = one worktree = one pane. The pane is reused across agent role
transitions (implementer → tester → reviewer). Step transitions send a new
prompt to the same pane id; only createTab when no live pane exists.

### Schema
- `src/state/schema.ts` — added `pane_step: z.number().int().nonnegative().optional()`.
  Tracks which step the pane is currently running so advance can distinguish
  'pane is running current step' (advance callback = done) from
  'pane exists but step mismatched' (spawn for new step).

### Engine
- `src/engine/types.ts` — `launchAgent` opts gained `existingPaneId?: string`.
- `src/engine/steps/shared.ts` — `launchOrReuse` now keys on `panes.primary`,
  returns `paneStep` when it spawns, and passes `existingPaneId` to launcher
  when reusing (so launcher reuses the tab instead of creating new).
- `src/engine/steps/agent.ts` — uses `paneStep` signal instead of per-role
  pane presence to detect spawn vs callback.

### Harness
- `src/harness/launcher.ts` — `launchAgent` now branches on `existingPaneId`:
  if set, `runInPane(existingPaneId, ...)` (no new tab); else `createTab` + run.

### Tests
- `test/engine/steps/shared.test.ts` — 6 tests covering spawn/reuse/callback/
  dead-pane/step-transition/pane-creation cases.
- `test/engine/advance.test.ts` — updated to single-pane model (panes.primary +
  pane_step assertions).
- `test/engine/helpers.ts` — `makeRun` defaults to a primary pane shape.

### E2E verification
Multi-step workflow (implementer → tester) against a real repo:
- After step 0 spawn: `panes.primary=w1H:p2, pane_step=0`.
- After advance (implementer callback → step 1 spawn): **same pane** `w1H:p2`,
  `pane_step=1`. Workspace contains root pane (herdr's) + agent pane (hordr's)
  — no extra tab created.

### Skipped
- Strict schema for panes (`z.object({primary: z.string()})`): kept permissive
  `z.record(z.string())` to avoid migration risk. Code convention enforces the
  single-key shape.
- Updating SPEC.md / new ADR for the single-worktree model: punt to a
  documentation pass.
