---
# hordr-t3a2
title: 'Slice 2: Engine rewrite - advance spawns-or-bumps; add fail() and resume()'
status: completed
type: task
priority: normal
created_at: 2026-07-01T12:58:30Z
updated_at: 2026-07-01T13:08:02Z
parent: hordr-4j5j
---

Slice 2: Engine rewrite - advance spawns-or-bumps; add fail() and resume()

## Summary of Changes

- src/engine/types.ts: dropped existingPaneId from launchAgent (no reuse).
- src/engine/steps/shared.ts: launchOrReuse → launchNewPane (always fresh pane, keyed by step).
- src/engine/steps/agent.ts: panes[step] presence = spawn-vs-callback signal.
- src/engine/steps/index.ts: export launchNewPane.
- src/engine/advance.ts: added fail(bean,reason), resume(bean,deps).
- src/engine/index.ts: export fail, resume.
- src/harness/launcher.ts, src/runtime.ts: always createTab.
- test/engine/advance.test.ts: rewritten for new-pane model + fail/resume tests.
- test/engine/steps/shared.test.ts: rewritten for launchNewPane.
