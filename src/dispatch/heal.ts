/**
 * Bean-status self-heal poll (ADR-0010).
 *
 * Called by the daemon on each tick for the fleet's active invocation. Two
 * cheap checks, no wall-clock judgment:
 * - bean completed AND worktree clean? → proceed (self-heal if /done was missed)
 * - bean completed BUT worktree dirty? → wait (agent hasn't committed yet —
 *   phantom-completion guard, ADR-0010 / hordr-7zxr)
 * - pane gone AND bean not completed? → blocked (crash)
 * - otherwise → wait
 *
 * No timeouts. The daemon never kills a member for taking too long.
 */
export interface HealDeps {
  /** Current bean status in the worktree ('completed', 'in-progress', 'todo', etc.). */
  beanStatus: (taskId: string) => string | undefined
  /** Whether the herdr pane still exists. */
  paneAlive: (paneId: string) => boolean
  /**
   * True if the lane worktree has no uncommitted non-beans changes. The
   * implementation (wired by the engine; called from `hordr fleet check` and
   * `hordr done`) runs `git status --porcelain`
   * and applies the beans-dir exclusion policy via {@link worktreeIsClean}.
   */
  worktreeClean: (worktreePath: string) => boolean
}

export interface HealOpts {
  paneId: string
  taskId: string
  /** Lane worktree path — where the agent worked. Used for the clean check. */
  worktreePath: string
}

export interface HealResult {
  action: 'blocked' | 'proceed' | 'wait'
  reason: string
}

/** Check the active invocation's state. Determines next daemon action. */
export function checkInvocation(opts: HealOpts, deps: HealDeps): HealResult {
  const status = deps.beanStatus(opts.taskId)
  if (status === 'completed') {
    if (!deps.worktreeClean(opts.worktreePath)) {
      return {action: 'wait', reason: 'bean completed but worktree dirty (uncommitted changes)'}
    }

    return {action: 'proceed', reason: 'bean completed'}
  }

  if (!deps.paneAlive(opts.paneId)) {
    return {action: 'blocked', reason: 'pane gone without completion (crash)'}
  }

  return {action: 'wait', reason: 'still working'}
}

/**
 * Pure policy: parse `git status --porcelain` output and return true only if
 * every dirty path is inside `beansDir`.
 *
 * Bean-status writes (`beans update -s completed`) land in the beans dir and
 * are the expected completion signal — they do NOT count as uncommitted work.
 * Any other dirty path means the agent edited code but hasn't committed yet,
 * so the daemon must wait (phantom-completion guard, hordr-7zxr).
 */
export function worktreeIsClean(porcelain: string, beansDir: string): boolean {
  const lines = porcelain.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return true

  const prefix = beansDir.replace(/\/+$/, '') + '/'
  for (const line of lines) {
    // porcelain v1: "XY PATH" — 2 status chars, space at index 2, path at 3+
    let p = line.slice(3)
    // rename: "R  OLD -> NEW" — the destination is what now exists
    const arrow = p.indexOf(' -> ')
    if (arrow !== -1) p = p.slice(arrow + 4)
    // strip surrounding quotes (git quotes paths with special chars)
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
    if (!p.startsWith(prefix)) return false
  }

  return true
}
