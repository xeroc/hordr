/**
 * 3-tier merge coordination (ADR-0014).
 *
 * attemptMerge is the only production entry point: clean-index guard →
 * checkout target → try --ff-only → fall back to --no-ff → on conflict,
 * leave the merge in-progress for the merger agent. restoreWorktree is the
 * post-resolution unwind (checkout back to the original branch).
 *
 * NEVER stashes. A dirty worktree is refused upfront (status 'aborted') so
 * uncommitted work is never moved out from under the user and a merger agent
 * is never spawned on top of uncommitted changes.
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

export interface MergeOpts {
  cwd: string
  ff?: boolean
  source: string
  target: string
}

export interface MergeDeps {
  git: GitFn
  /**
   * True if the worktree at `cwd` has a clean index (no uncommitted changes).
   * The merge is refused when this returns false — never stashed, never
   * clobbered. Callers wire a beans-dir-aware check (rollup writes are
   * committed before the merge, so they don't count as dirt).
   */
  isClean: (cwd: string) => boolean
}

export type MergeOutcome =
  | {message: string; status: 'aborted'}
  | {message: string; status: 'conflict'}
  | {message?: string; status: 'merged'}

/**
 * 3-tier merge strategy for epic → milestone merges (ADR-0014):
 *
 *  Guard: refuse a dirty worktree (return 'aborted') — never stash.
 *  Tier 1: git merge --ff-only  — clean fast-forward, no merge commit.
 *  Tier 2: git merge --no-ff    — merge commit. May conflict.
 *  Tier 3: conflict left in-progress — caller spawns a merger agent.
 *
 * On guard failure / tier 1-2 success: restores the previous branch (via
 * {@link restoreWorktree}). On tier 3 conflict: leaves the worktree on the
 * target branch with the conflicted merge in progress — does NOT abort, does
 * NOT restore. The caller must spawn the merger agent, then call
 * `restoreWorktree` after resolution (or abort on failure).
 */
export function attemptMerge(opts: MergeOpts, deps: MergeDeps): MergeOutcome {
  // Clean-index guard: a dirty worktree is refused outright. Stashing would
  // silently relocate the user's uncommitted work, and leaving a conflict
  // in-progress on a dirty worktree spawns an overlapping merger agent on
  // top of real changes.
  if (!deps.isClean(opts.cwd)) {
    return {message: `uncommitted changes in ${opts.cwd} — commit or stash them first`, status: 'aborted'}
  }

  // Checkout the target branch — we must be on target to merge into it.
  try {
    deps.git(['checkout', opts.target], {cwd: opts.cwd})
  } catch (error_) {
    restoreWorktree(opts.cwd, deps)
    // A checkout refusal (e.g. the target is checked out in another worktree)
    // is a pre-merge failure, NOT a conflict — reporting it as 'conflict'
    // spawned phantom merger agents with 0 conflicted files. Callers must
    // surface this as a hard error, not tier-3 escalation.
    return {message: `checkout ${opts.target} failed: ${(error_ as Error).message}`, status: 'aborted'}
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
 * Restore the worktree to its pre-merge state (checkout back to the original
 * branch). Called by the engine after the merger agent resolves and commits,
 * or after an abort. Best-effort: silent on missing previous-branch.
 *
 * No stash pop: attemptMerge never stashes (dirty worktrees are refused), so
 * there is never anything to pop.
 */
export function restoreWorktree(cwd: string, deps: {git: GitFn}): void {
  try {
    deps.git(['checkout', '-'], {cwd})
  } catch {
    // No previous branch — stay on current
  }
}
