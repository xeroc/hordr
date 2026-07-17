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
  ff?: boolean
  source: string
  target: string
}

/**
 * Merge source into target. Always checks out the target branch first,
 * then merges, then restores the previous branch. Stash/pop preserves
 * the human's uncommitted working-directory changes.
 *
 * We MUST checkout target before merging — the cwd might be on the source
 * branch (e.g. the ms worktree), and `git merge <source>` while on <source>
 * is a silent no-op ("Already up to date") that looks like success.
 *
 * `ff` controls --no-ff: true (default) allows fast-forward; false forces
 * a merge commit. Epic→ms merges use ff (let git fast-forward when possible).
 * Milestone→primary merges force --no-ff (mark the milestone as a discrete event).
 */
export function mergeBranch(opts: MergeOpts, deps: {git: GitFn}): MergeResult {
  const mergeArgs = ['merge']
  if (opts.ff === false) mergeArgs.push('--no-ff')
  mergeArgs.push(opts.source)

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
    tryRestore(deps, opts.cwd)
    return {conflict: true, message: `checkout ${opts.target} failed: ${(error_ as Error).message}`}
  }

  // Merge source into target.
  try {
    deps.git(mergeArgs, {cwd: opts.cwd})
  } catch (error_) {
    try {
      deps.git(['merge', '--abort'], {cwd: opts.cwd})
    } catch {
      // No merge in progress
    }

    tryRestore(deps, opts.cwd)
    return {conflict: true, message: (error_ as Error).message}
  }

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

/**
 * Merge the milestone integration branch back to primary (fleet finish).
 *  Uses --no-ff: the milestone is a discrete event worth a merge commit on primary.
 */
export function mergeMilestoneToPrimary(
  opts: {cwd: string; milestoneId: string; primaryBranch: string},
  deps: {git: GitFn},
): MergeResult {
  return mergeBranch({cwd: opts.cwd, ff: false, source: opts.milestoneId, target: opts.primaryBranch}, deps)
}
