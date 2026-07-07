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
