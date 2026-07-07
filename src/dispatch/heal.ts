/**
 * Bean-status self-heal poll (ADR-0010).
 *
 * Called by the daemon on each tick for the fleet's active invocation. Two
 * cheap checks, no wall-clock judgment:
 * - bean completed? → proceed (self-heal if /done was missed, or confirm if it arrived)
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
}

export interface HealResult {
  action: 'blocked' | 'proceed' | 'wait'
  reason: string
}

/** Check the active invocation's state. Determines next daemon action. */
export function checkInvocation(opts: {paneId: string; taskId: string}, deps: HealDeps): HealResult {
  const status = deps.beanStatus(opts.taskId)
  if (status === 'completed') return {action: 'proceed', reason: 'bean completed'}

  if (!deps.paneAlive(opts.paneId)) {
    return {action: 'blocked', reason: 'pane gone without completion (crash)'}
  }

  return {action: 'wait', reason: 'still working'}
}
