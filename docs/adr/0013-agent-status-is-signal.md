# ADR-0013: Agent Self-Reported Status Is the Signal

## Status

accepted

## Context

The `test` step handler in SPEC v1/v2 parsed the tester agent's pane output for literal strings `test-green` or `test-red` to decide whether to advance the run (green) or block it (red). This required:

- `detectTestSignal(paneId)` in `EngineDeps`
- `readAgentOutput(paneId)` in `EngineDeps` (used by detectTestSignal)
- `src/harness/test-signal.ts` (the detection logic)
- Fail-safe ordering (red checked first)

This couples the engine to a specific output convention (`test-green`/`test-red`) and requires the engine to read and parse agent output — a layering violation. The orchestrator should not understand what the agent did; it should only know whether the agent finished or got stuck.

## Decision

**The agent's herdr status IS the signal.** Herdr already supports five agent statuses: `idle | working | blocked | done | unknown`. The generic `agent` step handler waits for the first of `done` or `blocked`:

- `done` → the agent finished successfully → advance to the next step.
- `blocked` → the agent is stuck (tests failed, auth needed, unclear requirements) → block the run.

The engine never reads pane output to make workflow decisions. If the tester agent finds failing tests, its persona instructs it to signal `blocked` (not `done`). If it fixes the tests and they pass, it signals `done`.

## Consequences

**Positive:**

- **`detectTestSignal`, `readAgentOutput`, and `test-signal.ts` deleted entirely.**
- **EngineDeps shrinks** — two fewer methods to implement, mock, and maintain.
- **Domain-agnostic.** Any agent can signal blocked/done for any reason — not just test results. A research agent can signal blocked if it needs human input; a deploy agent can signal blocked if it hits an auth wall.
- **No output convention to maintain.** The `test-green`/`test-red` convention was a contract between the engine and the agent persona. Now the only contract is the herdr status, which herdr itself enforces.

**Negative:**

- **No structured fail-safe.** Previously, a null signal (neither green nor red in output) was treated as red (fail-safe). Now, if the agent crashes without signaling, herdr reports `unknown` — which the engine must handle. Mitigation: treat `unknown` as `blocked` (same fail-safe principle).
- **Agent must self-regulate.** A naive agent might signal `done` even when tests fail. The persona must clearly instruct: "if tests fail, signal blocked, not done."

## Alternatives Considered

1. **Generic signal patterns in step config.** `signal: "test-(green|red)"` with advance-on/blocked-on rules. Rejected: re-introduces output parsing and couples the engine to agent output conventions. Just moves the problem.

2. **Keep test-signal for coding, add generic for others.** Rejected: violates "two kinds only" (ADR-0011). The test handler becomes special again.

## References

- ADR-0011 (generic agent orchestration) — signal detection was the last piece of "smart" engine logic
- Grilling session (2026-06-27): "does signal detection survive, or does the agent own that too?"
