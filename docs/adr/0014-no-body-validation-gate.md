# ADR-0014: No Body Validation Gate

## Status

accepted

## Context

ADR-0008 introduced a type-aware body contract: tasks/bugs require 4 sections (Requirement, Spec, Acceptance Criteria, Test Plan); epics require 6 (adding Decisions + Decomposition). The `validateSpec` function was called as a gate by `hordr run` (before creating a Run) and `hordr decompose` (before spawning the planner).

This gate was designed for the old `plan → approve → run` workflow where the body needed to be a well-formed spec document before the engine would touch it. That workflow was deleted (ADR-0010 made `run` the universal entry; `plan` and `approve` commands were removed). The validation gate survived as vestigial ceremony.

After ADR-0011 (generic agent orchestrator), the body is just text passed to the agent via the persona prompt. The engine doesn't parse sections, doesn't extract headers, doesn't care about structure. The agent reads whatever's in the body and acts on it. A bean with a one-line description, a bean with 6 sections, and a bean with a stream-of-consciousness brain dump are all equally valid inputs — the agent handles the interpretation.

## Decision

**Remove the body validation gate from all commands.** `hordr run` and `hordr decompose` no longer call `validateSpec`. The body is accepted as-is, whatever its structure.

The `validateSpec` function (`src/beans/validate-spec.ts`) remains in the codebase as a utility. It is not called by any command. If a future workflow wants optional body checking, it can call the function explicitly — but the engine never gates on it.

## Consequences

**Positive:**

- **No ceremony.** Any bean can run immediately, regardless of body structure. The human writes what they think is useful; the agent works with what's there.
- **Consistent with ADR-0011.** The engine is domain-agnostic. Validating markdown section headers is a domain concern (spec quality), not an orchestration concern (should this bean be allowed to start?).
- **Fewer commands.** The mental model simplifies: write a bean → `hordr run`. No "is my body good enough?" anxiety.

**Negative:**

- **No guardrail against empty/garbage bodies.** A bean with body `""` or `"do stuff"` will start and the agent will have to figure it out. This is acceptable — the agent is capable, and the human who wrote the bean is responsible for its quality.
- **The `validateSpec` function is unused production code.** It stays as a utility with tests. If it remains unused for a release cycle, it can be deleted.

## Alternatives Considered

1. **Keep validation but make it optional (`--validate` flag).** Rejected: adds complexity for a feature nobody asked for. If someone wants validation, they can call the function from a script.
2. **Keep validation only for epics (before decompose).** Rejected: the decompose planner is an LLM — it can read any body structure and extract the spec. Enforcing sections on the human before the LLM even sees it is backwards.

## References

- ADR-0008 (epic bean IS the spec) — introduced the body contract
- ADR-0011 (generic agent orchestrator) — made the contract irrelevant
- User feedback: "Hordr should be lightweight and simple to use, not restricted to some arbitrary spec format."
