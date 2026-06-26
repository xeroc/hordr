# ADR-0010: Decomposed Children Skip Planning, Enter at `queued`

## Status

accepted

## Context

SPEC.md v1 gave every task bean the same lifecycle:

```
todo → (hordr plan) → planning → awaiting-approval → queued → running → ...
```

The `planning` and `awaiting-approval` states existed to gate the **discovery + spec drafting** phase: a planner agent filled in the body's 4 sections, then a human reviewed and approved before implementation began.

ADR-0008 changed where discovery happens: **discovery now happens outside hordr entirely** (a skill working on `develop` writes the epic + ADRs). `hordr decompose` then creates child task beans whose bodies are _already complete_ — the planner agent fills in all 4 sections during decomposition.

For these children, the planning phase is redundant:

- The body is complete. There's nothing to draft.
- The epic was the human review surface. The epic itself was reviewed and accepted before `hordr decompose` was invoked. Re-approving each child separately would multiply ceremony without adding safety.
- The work is already decomposed into independent units. That _was_ the planning.

## Decision

**Decomposed task beans (children of an epic) skip the planning phase entirely.** Their entry to the Run state machine is `queued`:

```
todo → (hordr run <child>) → queued → running → ...
```

`hordr run <child>` creates the Run directly in `queued` state when:

1. The bean type is `task` (or `bug`), AND
2. The bean has a parent bean of type `epic` whose status is `completed` (i.e., decomposition finished).

Standalone tasks (no parent epic) still go through `hordr plan` → `awaiting-approval` → `queued` as before.

## Consequences

**Positive:**

- **No ceremony tax on decomposed work.** A 10-child epic becomes 10 `hordr run <child>` invocations, not 10 plan/approve/run cycles.
- **The epic is the review surface.** Humans review the _spec_ (in the epic body), not the per-task scope. Decomposition is a translation step, not a decision step.
- **Discovery → decompose → implement is a clean pipeline.** Each phase has one command; no overlap.

**Negative:**

- **`hordr run` becomes branchy.** It now has two entry paths: "task with completed epic parent" (skip to `queued`) vs "standalone task" (require prior `plan`/`approve`). The branch is cheap to test but adds a code path.
- **No human gate between decompose and implement.** If the planner agent produces a bad decomposition (e.g. a child missing an AC section), the bad child can be run immediately. Mitigation: `hordr run` should validate the body via `validate-spec` before creating the Run, refusing to start if sections are missing. (This is an implementation detail of the run command, not a state machine change.)
- **Beans' `--blocked-by` is the only inter-child dependency mechanism.** If decomposition produces children that secretly depend on each other without `--blocked-by`, `hordr drain` may start them in the wrong order. This is a planner quality issue, not a run command issue.

## Alternatives Considered

1. **Children go through planning too.** Rejected: doubles the human's per-task workload with no added safety. The body is already complete.
2. **Children enter at `awaiting-approval` (lighter gate).** Rejected: the human already approved the epic. Per-task approval is the ceremony we're trying to eliminate.
3. **Different Run state for decomposed children (`pre-queued`).** Rejected: invents a new state for a single use case. `queued` already means "approved, waiting for slot" — that's exactly the right semantic.

## References

- SPEC-delta-planning.md §3 "Decomposed children enter at queued"
- ADR-0008 (epic bean IS the spec) — discovery happens before decomposition
- ADR-0009 (decompose is stateless) — the decompose command itself doesn't model state
