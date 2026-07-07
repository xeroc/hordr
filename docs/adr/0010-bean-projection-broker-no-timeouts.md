# Bean-state-projection broker with self-heal, no timeouts

The daemon's dispatch protocol projects over bean state rather than mirroring it. The dispatchable set for a fleet is **descendants-of-the-milestone ∩ `beans list --ready`** (readiness — status, dependencies, blockers — is beans' job; hordr recomputes nothing). When multiple beans are dispatchable, sort by `priority` desc then `id` asc. There is no message bus, no `tasks` table, no poll/ack protocol — beans hold work + work-state, the daemon reads them as a projector, never writes work-state itself.

Completion is signalled two ways, both bean-mediated:

- **Primary:** the member calls `hordr done <task-id>` over the daemon's socket after committing and flipping the bean to `completed`. Instant, explicit.
- **Self-heal fallback:** the daemon polls the current task's bean status on a tick (`hordr.dispatch.tick`, default 5s); if it flips to `completed` without a `/done`, the daemon proceeds anyway. The member forgetting the curl does not stall the fleet.

`/done` is therefore a fast-path, not a single point of failure. Beans are the truth; the curl is a courtesy.

**No wall-clock timeouts.** The daemon never kills a member for taking too long. Agent wall-clock is unpredictable, `blocked` agent-status often means "waiting on a permission prompt the human wants to approve interactively," and any threshold false-positives legitimate work. Failure handling is narrowed to three cases:

| Failure                       | Detection                      | Recovery                                                                                                    |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Crash (pane dies, no `/done`) | tick: pane-gone check          | mark task `blocked`, continue with next ready                                                               |
| Forgot-to-signal              | tick: bean-status poll         | self-heal → rollup → next                                                                                   |
| Hang / runaway                | (none — daemon does not judge) | human sees via `hordr fleet status` or the pane, acts (kill pane, `beans update -s blocked`, `fleet abort`) |

Rationale: a broker that owns work-state duplicates beans and rots (cafleet's lesson — its `tasks` table is ~half its schema). Projecting avoids the duplication entirely. The self-heal makes the broker robust to persona non-compliance without adding governance. And dropping timeouts removes a class of false-positive kills that cafleet's monitor exists to manage — serialized ephemeral invocations need no such monitor because the daemon's tick _is_ the supervision.
