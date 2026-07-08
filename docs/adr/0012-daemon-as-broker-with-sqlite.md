# Daemon-as-broker with SQLite process state

**Supersedes:** ADR-0004 (unix-socket daemon stub), ADR-0008 (no lifecycle state).
**Amended:** 2026-07-08 — add `lanes` table for per-epic worktree state (ADR-0014).

The daemon stops being a stub. It becomes the **broker**: a long-running process that owns the per-fleet dispatch loops, the `/done` socket route, rollup, and self-heal polling. One daemon per machine, multiplexing every active fleet across every project; each fleet gets its own serialized state machine (one member working at a time per fleet, fleets independent of each other) on a single Node event loop. Lazy auto-start — the first `hordr fleet create` ensures a daemon is running on `$HORDR_SOCKET` (default `~/.hordr/hordr.sock`), starting one if absent. The daemon self-exits after a grace period when zero fleets remain.

Process state moves to **SQLite** (`~/.local/share/hordr/hordr.db`, XDG state dir). The storage boundary is strict and load-bearing:

| Lives in **beans** (in-repo, per-worktree, committed)     | Lives in **SQLite** (machine-scoped, daemon-owned)                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Bean bodies, types, statuses, assignments, tree structure | Project registry (`project_key` → config/beans/company paths)               |
| The milestone's work contract + its child task tree       | Fleet rows (worktree path, branch, status)                                  |
| Status rollup (task → epic → milestone, via the broker)   | Invocation audit (task → role → pane → post-squash commit sha → timestamps) |
| Dynamic beans created mid-work                            | Cross-fleet / cross-project views                                           | Lane rows (per-epic: epic_bean_id, worktree_path, branch, pane_id, status, current_task_bean_id) |

The daemon **never mirrors bean status into SQLite**. It re-reads `.beans/` in the worktree whenever it needs work-state (the projector model, ADR-0010). SQLite holds only what beans structurally cannot express: process state, pane bindings, audit. Crash recovery is "restart the daemon, re-derive per-fleet dispatch from the worktree's `.beans/`" — no state is lost because the truth was never duplicated.

**Project identity = `git rev-parse --git-common-dir`** (absolute path of the shared git dir). This is stable across all worktrees of one clone (every worktree reports the same common dir) and differs across clones and repos, which is exactly the routing property the daemon needs: a member calling `hordr done` from a milestone worktree resolves to the same project as the human who ran `fleet create` from the main repo. Rejected alternatives: `.beans.yml` absolute path (breaks across worktrees — the bug that motivated this); a `project:` config slug (collides if two clones run active fleets simultaneously); git remote URL (no remote = no identity).

Rationale: cafleet deliberately went serverless (CLI → SQLite directly) because it has no substrate richer than its own DB. Hordr has beans. A stateless CLI can't push `/done`-style signals or run a dispatch loop reactively, so hordr's daemon earns its keep — but it owns only what beans cannot, keeping the duplication that killed hordr's prior Run-state layer (the original ADR-0008 rationale) from returning.
