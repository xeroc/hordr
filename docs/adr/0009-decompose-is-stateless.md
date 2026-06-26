# ADR-0009: `hordr decompose` Is Stateless (Not a Run)

## Status

accepted

## Context

SPEC.md v1 modeled every long-running hordr operation as a **Run** — a state-tracked passage through a workflow. `hordr plan` created a Run in `planning` state, advanced it through `awaiting-approval`, `queued`, `running`, etc. Runs persisted state files; supervisor panes looped `advance` against them.

When the planning model matured (ADR-0008: epics hold specs, decomposition creates children), the question arose: should `hordr decompose <epic>` also be a Run? It spawns an agent pane (the planner), waits for done, mutates the epic bean, and creates child beans. It looks Run-shaped.

Three options:

1. **Model decompose as a Run on the epic bean.** New Run state machine path: epic gets a Run in `decomposing` state, transitions to `decomposed` when done.
2. **Model decompose as a Run on a synthetic "discovery" bean.** Create a placeholder task bean for the decompose work itself, run it through the existing workflow.
3. **Decompose is a stateless CLI command.** No Run. Spawn pane, wait for done, update bean, exit.

## Decision

**Decompose is a stateless CLI command.** No Run state, no supervisor pane, no state file.

The command does have observable side effects (creates child beans, mutates the epic body), but those are atomic writes via the `beans` CLI. There is no intermediate state worth persisting — either the planner finished and wrote its outputs, or it didn't.

## Consequences

**Positive:**

- **No Run state complexity for epics.** Epics never have Run state files. The Run state machine (§3) applies only to task/bug beans. This keeps the SM small and focused on implementation.
- **Decompose is restartable for free.** If the planner pane dies mid-decompose, the human re-runs `hordr decompose <epic>`. The planner idempotently checks existing children (via `beans list --parent <epic>`) before creating new ones. No state to clean up.
- **Decompose runs on `develop`, no worktree needed.** This is important: ADRs live on develop, and the epic bean lives on develop. Decompose doesn't write code — it writes beans. A worktree would be overkill.
- **Idempotency is enforced at the operation level, not the state level.** "Has Decomposition been filled?" is a property of the bean body, not a Run state transition.

**Negative:**

- **No `hordr status` visibility during decompose.** Because there's no Run, `hordr status` won't show "decompose in progress" for the epic. Mitigation: decompose is typically fast (minutes, not hours); the human can watch the planner pane directly.
- **No automatic resume.** A Run that gets interrupted can be resumed via `hordr advance`. Decompose that gets interrupted must be re-run manually. Acceptable for a planning operation.
- **Planner pane lifecycle is owned by the command, not the engine.** The command spawns the pane and waits synchronously. If the command is killed, the pane may be orphaned. Mitigation: idempotent re-run; herdr pane cleanup on session exit.

## Alternatives Considered

1. **Decompose as a Run with `decomposing` state.** Rejected: adds a state to the SM that's only used for epics, which otherwise never enter the SM. The complexity isn't justified by the operation's nature (atomic-ish, restartable).
2. **Decompose as a separate workflow.** Rejected: §4 keeps the step-kind set closed at 8. Adding `decompose` as a step kind would violate that closure and invite scope creep (what's next, `archeology`? `synthesis`?).
3. **Decompose as a background daemon.** Rejected: SPEC §9 (non-goals) explicitly defers daemons to Phase 2.

## References

- SPEC-delta-planning.md §3 "Run state machine — modified" (Runs are implementation-only)
- ADR-0004 (action-driven, no daemon) — same principle: explicit invocation, no scheduler
- ADR-0008 (epic bean IS the spec) — decompose mutates the spec bean directly
