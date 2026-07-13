---
# hordr-rnq9
title: 'Wire rollup: markCompleted → beans update (ADR-0011)'
status: completed
type: task
priority: high
created_at: 2026-07-09T10:45:26Z
updated_at: 2026-07-09T10:52:24Z
parent: hordr-7hpb
---

The broker's markCompleted is a no-op, so rollup never propagates bean status. Per ADR-0011, rollup must run `beans update <ancestor> -s completed --cwd <worktree>`. Add markBeanCompleted to the beans client (the broker's one sanctioned bean-status write) and wire broker.createTickDeps.markCompleted to it. The tick's advanceLane 'proceed' branch already calls rollup(taskId, {fetchAncestry, markCompleted}) — wiring markCompleted makes it actually propagate. /done synchronous rollup + fixup/autosquash folding are a separate follow-up.

## Summary of Changes

- `src/beans/client.ts`: `markBeanCompleted(id, {cwd})` — runs `beans update <id> -s completed` (the broker's one sanctioned bean-status write, ADR-0011); updated the client header comment (hordr is read-only outside rollup)
- `src/daemon/broker.ts`: `createTickDeps.markCompleted` now calls `markBeanCompleted(id, {cwd})` instead of no-op — so the tick's advanceLane 'proceed' rollup actually propagates epic/feature status
- Tests: markBeanCompleted (args + cwd + error wrapping), createTickDeps.markCompleted wired to beans update

The tick's advanceLane 'proceed' branch already calls rollup(taskId, {fetchAncestry, markCompleted}); this makes it write. /done synchronous rollup + fixup/autosquash folding deferred to a follow-up.
