/**
 * 3-tier merge coordination (ADR-0014).
 *
 * attemptMerge is the only production entry point: stash → checkout target →
 * try --ff-only → fall back to --no-ff → on conflict, leave the merge
 * in-progress for the merger agent. restoreWorktree is the post-resolution
 * unwind (checkout back + stash pop).
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

export interface MergeOpts {
  cwd: string
  ff?: boolean
  source: string
  target: string
}

export type MergeOutcome = {message: string; status: 'conflict'} | {message?: string; status: 'merged'}

/**
 * 3-tier merge strategy for epic → milestone merges (ADR-0014):
 *
 *  Tier 1: git merge --ff-only  — clean fast-forward, no merge commit.
 *  Tier 2: git merge --no-ff    — merge commit. May conflict.
 *  Tier 3: conflict left in-progress — caller spawns a merger agent.
 *
 * On tier 1/2 success: restores the previous branch + pops stash (via
 * restoreWorktree). On tier 3 conflict: leaves the worktree on the target
 * branch with the conflicted merge in progress — does NOT abort, does NOT
 * restore. The caller must spawn the merger agent, then call
 * {@link restoreWorktree} after resolution (or abort on failure).
 */
export function attemptMerge(opts: MergeOpts, deps: {git: GitFn}): MergeOutcome {
  // Stash uncommitted changes (if any).
  try {
    deps.git(['stash', 'push', '-u', '--quiet'], {cwd: opts.cwd})
  } catch {
    // Nothing to stash
  }

  // Checkout the target branch — we must be on target to merge into it.
  try {
    deps.git(['checkout', opts.target], {cwd: opts.cwd})
  } catch (error_) {
    restoreWorktree(opts.cwd, deps)
    return {message: `checkout ${opts.target} failed: ${(error_ as Error).message}`, status: 'conflict'}
  }

  // Tier 1: fast-forward only.
  try {
    deps.git(['merge', '--ff-only', opts.source], {cwd: opts.cwd})
    restoreWorktree(opts.cwd, deps)
    return {status: 'merged'}
  } catch {
    // Not fast-forwardable — fall through to tier 2.
  }

  // Tier 2: merge commit (--no-ff).
  try {
    deps.git(['merge', '--no-ff', opts.source], {cwd: opts.cwd})
    restoreWorktree(opts.cwd, deps)
    return {status: 'merged'}
  } catch (error_) {
    // Conflict — leave the merge in-progress for the merger agent.
    // Do NOT abort, do NOT restore.
    return {message: (error_ as Error).message, status: 'conflict'}
  }
}

/**
 * Restore the worktree to its pre-merge state (checkout back + stash pop).
 * Called by the engine after the merger agent resolves and commits, or
 * after an abort. Best-effort: silent on missing previous-branch / empty stash.
 */
export function restoreWorktree(cwd: string, deps: {git: GitFn}): void {
  try {
    deps.git(['checkout', '-'], {cwd})
  } catch {
    // No previous branch — stay on current
  }

  try {
    deps.git(['stash', 'pop', '--quiet'], {cwd})
  } catch {
    // No stash to pop — fine
  }
}
