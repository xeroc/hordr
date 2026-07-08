/**
 * Two-level merge coordination (ADR-0014).
 *
 * mergeBranch(target, source, cwd, git) does: git checkout target + git merge
 * --no-ff source. On failure (non-zero exit, including merge conflicts), returns
 * {conflict: true} — the daemon sets the lane status to conflict and surfaces
 * it for human resolution.
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

/** Checkout target, merge source with --no-ff. Returns conflict status. */
export function mergeBranch(opts: MergeOpts, deps: {git: GitFn}): MergeResult {
  try {
    deps.git(['checkout', opts.target], {cwd: opts.cwd})
    deps.git(['merge', '--no-ff', opts.source], {cwd: opts.cwd})
    return {conflict: false}
  } catch (error) {
    return {conflict: true, message: (error as Error).message}
  }
}

/** Merge the milestone integration branch back to primary (fleet finish). */
export function mergeMilestoneToPrimary(
  opts: {cwd: string; milestoneId: string; primaryBranch: string},
  deps: {git: GitFn},
): MergeResult {
  return mergeBranch({cwd: opts.cwd, source: `ms/${opts.milestoneId}`, target: opts.primaryBranch}, deps)
}
