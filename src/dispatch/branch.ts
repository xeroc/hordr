/**
 * Milestone integration branch lifecycle (ADR-0014).
 *
 * At fleet create: `git branch <milestone-id> <primary>` creates the
 * integration branch from primary. Epic worktrees branch from it; epic
 * branches merge into it; at fleet finish it merges back to primary.
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

/** Compute the milestone integration branch name: same as the bean id. */
export function milestoneBranchName(milestoneId: string): string {
  return milestoneId
}

/** Create the milestone integration branch from the primary branch. Idempotent. */
export function createMilestoneBranch(
  opts: {cwd: string; milestoneId: string; primaryBranch: string},
  deps: {git: GitFn},
): void {
  const branch = milestoneBranchName(opts.milestoneId)
  try {
    deps.git(['branch', branch, opts.primaryBranch], {cwd: opts.cwd})
  } catch {
    // Branch already exists — reuse it (preserves previous epic merges).
  }
}
