# ADR-0008: Epic Bean Body IS the Spec

## Status

accepted

## Context

The initial hordr design (SPEC.md v1) treated every bean uniformly with a 4-section body (Requirement / Spec / Acceptance Criteria / Test Plan). Epics were purely organizational containers — their bodies held the same 4 sections as tasks, and architectural decisions lived... somewhere unspecified. In practice this created three problems:

1. **Spec drift.** The "real" spec lived in living documents (markdown files, Notion, a `specs/` directory that nobody agreed to create), while the epic bean body was a thin pointer. Two sources of truth diverged within a sprint.
2. **Architecture re-decided per task.** Without a durable record of _why_ an approach was chosen, each task agent re-litigated the decision. The implementer agent for task A would pick a different state management library than the implementer for task B, because neither knew the other existed.
3. **Discovery was ad-hoc.** Spec authoring happened wherever the human happened to be writing — a Google Doc, a Notion page, a chat thread — and was manually transcribed into beans when work started. The transcription step lost fidelity.

## Decision

**The epic bean body IS the spec document.** Epics use a 6-section body contract:

1. `## Requirement` — problem statement
2. `## Spec` — full technical spec (scope, user journeys, key flows, constraints). **This is the spec.** No separate file.
3. `## Decisions` — bulleted ADR references (`[ADR-NNNN](docs/adr/NNNN-*.md)`)
4. `## Decomposition` — filled by `hordr decompose` (list of child beans)
5. `## Acceptance Criteria`
6. `## Test Plan`

ADRs (`docs/adr/NNNN-*.md`) are the **only** file-based planning artifacts. They exist because cross-cutting architectural decisions span multiple epics; they deserve their own memory layer. Everything else stays in beans.

## Consequences

**Positive:**

- Single source of truth for any given unit of work. The epic's spec is in the bean; the task's spec is in its bean; the architecture is in ADRs. No divergence possible.
- Discovery (the skill that writes specs) and decomposition (`hordr decompose`) both operate on beans — uniform tooling.
- Agents reading the spec don't need to follow file paths or know where specs live. `beans show <epic>` returns the full spec.
- Git history of the spec is automatic (beans are markdown files under `.beans/`).

**Negative:**

- Spec length pressure. Epic bodies can get long — the 6-section contract encourages thoroughness, which is good, but `beans show` output becomes noisy for very large epics. Mitigation: decomposition splits the work; the epic body should remain a _spec_, not an implementation guide.
- Discoverability of ADRs requires reading the `## Decisions` section. No automatic index. Mitigation: agents are instructed to read `docs/adr/` directly when context is needed.
- Bean body becomes a write target for `hordr decompose` (filling `## Decomposition`). This couples the decompose command to the body contract — changes to the contract require updates to decompose.

## Alternatives Considered

1. **Separate `specs/` directory with epic bodies as pointers.** Rejected: recreates the spec-drift problem. Two locations for the same information.
2. **ADRs embedded directly in the epic body (no separate files).** Rejected: ADRs span epics. An architectural decision made in epic A might be cited in epic B; if ADRs lived inside epic bodies, citing across epics would require bean-to-bean reads with fragile section anchors.
3. **No specs at all; work emergently from chat.** Rejected: scale collapses. Three sprints in, nobody remembers why Postgres was chosen over SQLite.

## References

- SPEC-delta-planning.md §2 "Bean lifecycle — modified" (the source of this decision)
- ADR-0003 (bean status coarse, run state fine) — orthogonal, still applies
