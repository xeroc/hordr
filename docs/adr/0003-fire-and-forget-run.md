# Fire-and-forget run model

> **Superseded by ADR-0009 (fleet: serialized milestone dispatch) on 2026-07-07. Kept for history.**
> Outside a fleet, `hordr run`/`hordr cleanup` remain fire-and-forget exactly as described here. Inside a fleet, the daemon owns a serialized dispatch loop with a `/done` handshake — the "no advance loop, no completion handshake" claim below no longer holds in that context.

`hordr run <bean>` creates a worktree, spawns the agent harness in a fresh pane, and returns. There is no supervisor pane, no advance loop, no completion handshake, and no Run state. The agent works in its pane; the human inspects the worktree or PR when satisfied.

Rationale: the prior engine tracked per-bean Run state (`queued`/`running`/`blocked`/`closed`) and drove agents through multi-step workflows with HITL gates. In practice that machinery smeared hordr's concerns across engine code, state files, and a queue — while the actual value hordr provides is narrow: give an agent an isolated worktree and a pane, with the bean as its brief. Removing the engine collapses the codebase by half and eliminates an entire failure surface (stale state files, orphan branches, dead supervisor panes, concurrency races). Parent/child bean orchestration, workflow sequencing, and merge gating all move out of hordr — they are the human's job (or a future tool's) now.

The trade-off is explicit: hordr no longer "drives" a bean to completion. Each `hordr run` is one shot. If the agent needs a follow-up step, the human runs `hordr run` again (possibly with `--role reviewer`) or just talks to the agent in its pane. This matches how the agents were actually being used and keeps hordr boring.
