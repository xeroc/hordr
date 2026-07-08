/**
 * Broker-owned rollup: ancestry walk + status propagation (ADR-0011).
 *
 * When a task bean flips to completed, status propagates upward: walk the
 * ancestry chain, mark each ancestor completed when all its descendants
 * are completed, stop at the first ancestor with open descendants. Uniform
 * for all non-leaf types (epic/feature/milestone).
 *
 * Pure function with injected deps: the daemon wires fetchAncestry (beans
 * query for parent chain + subtree status) and markCompleted (beans update).
 */
/**
 * Check if all the milestone's epic children are completed (ADR-0014).
 * Called after each epic merge into the milestone branch. If true, the
 * milestone bean itself can be marked completed → fleet is finishable.
 */
export function areAllEpicsCompleted(
  milestoneId: string,
  deps: {fetchEpicStatuses: (id: string) => Array<{id: string; status: string}>},
): boolean {
  const epics = deps.fetchEpicStatuses(milestoneId)
  return epics.length > 0 && epics.every((e) => e.status === 'completed')
}

export function isMilestoneComplete(
  milestoneId: string,
  deps: {beanStatus: (id: string) => string | undefined},
): boolean {
  return deps.beanStatus(milestoneId) === 'completed'
}

export interface AncestorInfo {
  descendantsAllCompleted: boolean
  id: string
}

export interface RollupDeps {
  /** Fetch the task's ancestor chain (nearest first), each with subtree status. */
  fetchAncestry: (taskId: string) => AncestorInfo[]
  /** Mark a bean completed in the worktree. */
  markCompleted: (beanId: string) => void
}

/**
 * Walk the ancestry, mark completed ancestors. Returns the list of ancestors
 * that were marked (in walk order: nearest first).
 */
export function rollup(taskId: string, deps: RollupDeps): string[] {
  const ancestors = deps.fetchAncestry(taskId)
  const marked: string[] = []

  for (const ancestor of ancestors) {
    if (!ancestor.descendantsAllCompleted) break
    deps.markCompleted(ancestor.id)
    marked.push(ancestor.id)
  }

  return marked
}
