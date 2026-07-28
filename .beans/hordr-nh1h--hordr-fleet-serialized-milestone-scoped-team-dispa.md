---
# hordr-nh1h
title: 'hordr fleet: serialized milestone-scoped team dispatch'
status: completed
type: milestone
priority: critical
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-22T09:23:03Z
---

Grow hordr a fleet model on top of hordr run. A fleet = one team (Agent Companies package) working one milestone bean in one worktree, via a serialized dispatch loop of ephemeral agent invocations. See ADRs 0009-0013.

## Work Log

Started 2026-07-07: working the dependency order storage → dispatch → daemon → rollup → commands → dynamic → personas. Committing per task.



## Completion Summary (2026-07-09)

Milestone complete. Fleet model grown on top of `hordr run`: one team works one milestone via a daemon-driven tick loop of ephemeral per-lane invocations, with two-level (epic→ms→primary) merge coordination.

**Epics delivered (10):**
- Storage (SQLite: projects/fleets/lanes/provenance), dispatch & invocation, lane management (per-epic worktrees, lazy creation), broker-owned rollup, two-level merge, daemon broker, personas & conventions, dynamic beans (draft-gated), fleet commands (create/status/finish/abort), daemon broker runtime (tick wiring).

**Surface:** `hordr fleet {create,status,finish,abort}`, a fleets/lanes/provenance SQLite repository, a fleet-lifecycle layer, the broker tick (scan→createLane→advanceLane), daemon auto-start + /done route, pane reuse, draft listing, provenance audit, rollup wired to `beans update` (ADR-0011).

**Tests:** 263 passing. TDD throughout; pure functions with injected deps, commands are thin wrappers.

**Deferred (draft hordr-xsu6):** /done synchronous rollup + fixup/autosquash folding of rollup writes into the work commit (ADR-0011 commit-hygiene refinement). Functional rollup already propagates via the tick.
