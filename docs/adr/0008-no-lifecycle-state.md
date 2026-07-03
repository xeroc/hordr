# Hordr owns no lifecycle state

Hordr persists nothing between invocations. There is no Run state file, no `.hordr-state/` directory, no status machine, no queue, no per-bean record of "where we are." The bean's status (owned by `beans`) and the worktree's existence (owned by `herdr`/git) are the only lifecycle signals.

Rationale: the prior Run-state layer duplicated information already present elsewhere — bean status in `beans`, worktree existence in `herdr`, agent progress in the agent's own pane. Synchronising the duplicate copy with reality was the source of most of hordr's bugs (stale JSON, orphan branches, blocked runs that had actually been fixed in the pane). Removing the layer means `hordr run` is a pure function of (bean, config, environment) → (worktree, pane), and `hordr cleanup` is its inverse. There is nothing to get out of sync.

Practical consequences:

- "Is this bean being worked on?" → check `herdr worktree list` for `bean/<id>`, or look at bean status in `beans`.
- "Did the agent finish?" → look at the pane, or the git log on the branch, or the PR. Hordr does not know and does not pretend to.
- "Resume after a crash" → there is nothing to resume; run `hordr run <bean>` again (it will reuse the existing worktree) or talk to the agent in its existing pane.

The daemon stub (ADR-0004) holds no state either — when agent-facing routes arrive, they will operate on beans/herdr directly, not on a hordr-internal mirror.
