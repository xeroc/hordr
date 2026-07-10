/**
 * Two-level merge coordination (ADR-0014).
 *
 * mergeBranch(target, source, cwd, git) does: git stash → checkout target →
 * merge --no-ff source → checkout back → stash pop. The stash/pop preserves
 * the human's uncommitted working-directory changes across the branch switch.
 *
 * On any failure: best-effort cleanup (merge --abort, checkout back, stash pop)
 * then returns {conflict: true}. The daemon sets the lane to conflict.
 *
 * Used for both merge levels:
 * - Epic → milestone integration branch (on epic-complete)
 * - Milestone integration branch → primary (on fleet finish)
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

export interface MergeResult {
  conflict: boolean
  message?: string
}

export interface MergeOpts {
  cwd: string
  source: string
  target: string
}

/** Stash, checkout target, merge --no-ff, restore. Returns conflict status. */
export function mergeBranch(opts: MergeOpts, deps: {git: GitFn}): MergeResult {
  // Stash uncommitted changes so checkout doesn't fail on dirty working dir.
  // -u includes untracked files. --quiet suppresses "No local changes" noise.
  // Fails silently when there's nothing to stash.
  try {
    deps.git(['stash', 'push', '-u', '--quiet'], {cwd: opts.cwd})
  } catch {
    // Nothing to stash — fine
  }

  try {
    deps.git(['checkout', opts.target], {cwd: opts.cwd})
  } catch (error) {
    tryRestore(deps, opts.cwd)
    return {conflict: true, message: `checkout ${opts.target} failed: ${(error as Error).message}`}
  }

  try {
    deps.git(['merge', '--no-ff', opts.source], {cwd: opts.cwd})
  } catch (error) {
    // Merge conflict — abort, go back, restore stash
    try {
      deps.git(['merge', '--abort'], {cwd: opts.cwd})
    } catch {
      // merge --abort fails if there's no merge in progress — ignore
    }

    tryRestore(deps, opts.cwd)
    return {conflict: true, message: (error as Error).message}
  }

  // Success — return to the original branch and restore stash
  tryRestore(deps, opts.cwd)
  return {conflict: false}
}

/** Checkout back to the previous branch and pop the stash. Best-effort. */
function tryRestore(deps: {git: GitFn}, cwd: string): void {
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

/** Merge the milestone integration branch back to primary (fleet finish). */
export function mergeMilestoneToPrimary(
  opts: {cwd: string; milestoneId: string; primaryBranch: string},
  deps: {git: GitFn},
): MergeResult {
  return mergeBranch({cwd: opts.cwd, source: `ms/${opts.milestoneId}`, target: opts.primaryBranch}, deps)
}
