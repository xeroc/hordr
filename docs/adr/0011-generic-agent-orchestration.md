# ADR-0011: Hordr Is a Generic Agent Orchestrator

## Status

accepted

## Context

SPEC.md v1 (and v2) defined a closed set of 8 step kinds: draft-spec, hitl, implement, test, review, commit, pr, cleanup. Six of these are coding-specific: they prescribe how code gets written, tested, committed, PR'd, and cleaned up.

This created three problems:

1. **Domain lock-in.** The engine can only orchestrate coding workflows. A bean that says "research X and write a report" has no meaningful commit/pr/cleanup steps. The workflow either pads with no-ops or doesn't fit the model.

2. **Correctness logic in the wrong layer.** The `commit` handler enforces a trailer format (`Refs: <bean-id>`). The `test` handler parses agent output for `test-green`/`test-red`. The `pr` handler checks `gh pr list`. These are domain-specific correctness guarantees that belong in the agent's instructions (persona), not in the orchestrator's step handlers.

3. **Complexity proportional to domain assumptions.** Each new domain-specific behavior (deploy? migrate? publish?) would need a new step kind, violating the "closed set" principle from SPEC §4. The set was closed to prevent scope creep — but the right fix is to make the set so small it doesn't need to grow.

## Decision

**Hordr orchestrates generic agent workflows.** The closed set of step kinds collapses from 8 to 2:

- **`agent`**: spawn a role-configured agent, wait for it to signal `done` or `blocked`, advance or block the run accordingly.
- **`hitl`**: block until an external command resolves the gate (`hordr approve`, `hordr close-merged`, or a future mechanism).

All domain-specific behavior (what the agent does, how it commits, whether it opens a PR, how it runs tests) lives in the **agent persona** — the text injected as the agent's opening prompt. The engine never inspects agent output to make workflow decisions.

## Consequences

**Positive:**

- **Engine shrinks dramatically.** 6 step handler files deleted. EngineDeps loses `detectTestSignal`, `readAgentOutput`, and potentially `launchAgent`/`waitForAgentDone` move to a simpler interface. ~400 lines of production code removed.
- **Domain-agnostic.** The same engine orchestrates coding, research, writing, ops — any workflow expressible as "run agent, wait, maybe gate."
- **No more closed-set debate.** Two kinds don't need a governance process. Adding behavior = writing persona text, not writing engine code.
- **Simpler workflow YAML.** Each step is `- agent: <role>` or `- hitl: <flavor>`. No `kind`, `pane`, `wait`, `optional` fields.

**Negative:**

- **No engine-level correctness guarantees.** The trailer format, test-signal detection, PR existence check — all move to persona text. A misbehaving agent could skip the commit, format the trailer wrong, or forget to open a PR. Mitigation: capable agents (opencode, claude) follow instructions reliably; the human reviews at HITL gates.
- **`close-merged` loses the trailer-based commit lookup.** Currently it finds PRs by branch name (not trailer), so this is not actually a regression. But the `commit` handler's `git log --grep=Refs:` idempotency check is gone — re-running a step might produce a duplicate commit. Mitigation: agents should check for existing commits before committing (part of the persona).

## Alternatives Considered

1. **Keep 8 kinds, add more for new domains.** Rejected: the closed set grows linearly with domain count. The engine becomes a workflow library, not an orchestrator.

2. **Plugin-based step kinds.** Rejected: adds a plugin system to solve a problem that doesn't exist if the step set is small enough. Two kinds don't need plugins.

3. **Keep coding-specific kinds but make them optional.** Rejected: "optional coding steps in a generic engine" is the worst of both worlds — the engine still carries the domain assumptions, and workflows become harder to reason about.

## References

- Grilling session (2026-06-27): "what do we have kind in .beans.yaml for, really"
- ADR-0012 (worktree is workflow config) — follows from this decision
- ADR-0013 (agent status is signal) — follows from this decision
