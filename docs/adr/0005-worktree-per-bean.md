# Worktree-per-bean, branch is the bean id

> **Superseded by ADR-0009 (fleet: serialized milestone dispatch) on 2026-07-07. Kept for history.**
> Inside a fleet, worktrees are per-**milestone** (branch `milestone/<id>`), hosting many task commits; one task = one commit, serialized, in the shared worktree. This per-bean worktree model survives unchanged as the special case for `hordr run <bean>` outside any fleet.

Every `hordr run <bean>` creates a git worktree branched from `config.primary_branch` (default `develop`) with the branch name equal to the bean id (e.g. `hordr-XXXX`). This matches the fleet lane convention where the epic worktree branch is the epic id. The agent runs inside that checkout. `hordr cleanup <bean>` tears the worktree back down.

Rationale: agents must not stomp on each other or on `develop`. A worktree per bean is the cheapest isolation that still lets the agent run real git commands, run the test suite, and open a PR from a clean branch. The branch naming convention is load-bearing — `hordr cleanup` finds the worktree by branch.

Worktree creation is idempotent in the recovery sense: if a prior create died after `git branch` succeeded but before the worktree linked, hordr deletes the orphan branch and retries. If the branch exists AND a worktree is linked, hordr reuses it (`herdr worktree open`). This handles the two real-world failure modes without forcing the human to intervene.
