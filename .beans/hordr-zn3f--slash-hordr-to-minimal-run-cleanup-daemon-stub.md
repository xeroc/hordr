---
# hordr-zn3f
title: 'Slash hordr to minimal: run + cleanup + daemon stub'
status: completed
type: milestone
priority: high
created_at: 2026-07-02T14:05:41Z
updated_at: 2026-07-02T14:31:51Z
---

Keep only: hordr run (worktree+pane+harness), hordr cleanup (worktree+branch teardown), hordr daemon (/health stub). Drop engine/state/events/most commands. Config shrinks to agents+branches+company.

## Summary of Changes

Slashed hordr to 3 commands + daemon stub. 1570 LOC src total.

Kept:
- commands/run.ts — worktree + pane + harness (persona + bean body). --role, --base, --json.
- commands/cleanup.ts (new) — open-by-branch + removeWorktree.
- commands/daemon.ts — /health-only stub over unix socket.
- beans/client.ts (getBean/getBody only), config/{schema(shrunk),loader}, company.ts,
  herdr/{pane(trimmed),worktree}, harness/launcher (buildPrompt = persona + body, no daemon refs),
  runtime.ts (HordrDeps: createWorktree, launchAgent, removeWorktree), daemon/{server(/health only),socket}.

Dropped:
- src/engine/ (entire), src/state/ (entire), src/events/ (entire).
- commands: advance, drain, reset, status, take, close-merged, on-worktree-{created,removed}, resume.
- herdr/{wait, index barrel}, daemon/client.ts.
- config fields: workflows, routing, concurrency.
- ~20 dead tests; rewrote survivors.

85 tests pass. typecheck + lint clean. e2e smoke verified all 3 commands + daemon.
