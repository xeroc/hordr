# Worktree-per-bean, branch is `bean/<id>`

Every `hordr run <bean>` creates a git worktree branched from `config.primary_branch` (default `develop`) with the branch name `<worktree_branch_prefix><beanId>` (default `bean/hordr-XXXX`). The agent runs inside that checkout. `hordr cleanup <bean>` tears the worktree back down.

Rationale: agents must not stomp on each other or on `develop`. A worktree per bean is the cheapest isolation that still lets the agent run real git commands, run the test suite, and open a PR from a clean branch. The branch naming convention is load-bearing — `hordr cleanup` finds the worktree by branch, and the `bean/` prefix is treated as hordr-owned (the recovery path in `runtime.createWorktree` will `git branch -d` an orphan `bean/*` branch but never a non-prefixed one).

Worktree creation is idempotent in the recovery sense: if a prior create died after `git branch` succeeded but before the worktree linked, hordr deletes the orphan branch and retries. If the branch exists AND a worktree is linked, hordr reuses it (`herdr worktree open`). This handles the two real-world failure modes without forcing the human to intervene.
