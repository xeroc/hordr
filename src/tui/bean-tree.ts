/**
 * Pure bean-tree construction for the TUI. No OpenTUI, no I/O — mocha-tested.
 * The tree is built from the flat `beans list --json` output (which carries
 * `parent` + `type`), then fleet lanes are attached to epic nodes so every
 * descendant knows the lane (workspace/pane) and worktree it runs in.
 */

/** Minimal bean fields the TUI uses, projected from `beans list --json`. */
export interface BeanSummary {
  id: string
  parent?: string
  priority: string
  status: string
  title: string
  type: string // milestone | epic | feature | task
}

/** Fleet-lane context attached to epic nodes (and inherited by descendants). */
export interface LaneInfo {
  agentActive: boolean
  currentTask: null | string
  laneStatus: string
  paneId?: string
  workspaceId?: string
  /** Filesystem path of this lane's worktree — the cwd to read its beans from. */
  worktreePath: string
}

export interface TreeNode {
  bean: BeanSummary
  children: TreeNode[]
  depth: number
  /** True when this node is its lane's currently-dispatched task. */
  isCurrentTask: boolean
  /** Nearest ancestor epic's lane (set on epics too), or undefined. */
  lane?: LaneInfo
  /** Worktree to read this bean from (milestone→ms wt, others→lane wt). */
  worktreePath: string
}

const CHILD_TYPES = new Set(['epic', 'feature', 'milestone'])

/** Can this node have children (and thus be expandable)? */
export function isContainer(node: TreeNode): boolean {
  return CHILD_TYPES.has(node.bean.type)
}

/**
 * Build the nested tree rooted at `milestoneId` from a flat bean list. Beans
 * are linked via their `parent` field. Returns null if the milestone isn't in
 * the list. Depth starts at 0 for the root.
 */
export function buildBeanTree(beans: readonly BeanSummary[], milestoneId: string): null | TreeNode {
  const byParent = new Map<string, BeanSummary[]>()
  let rootBean: BeanSummary | undefined
  for (const bean of beans) {
    if (bean.id === milestoneId) rootBean = bean
    if (bean.parent) {
      const siblings = byParent.get(bean.parent) ?? []
      siblings.push(bean)
      byParent.set(bean.parent, siblings)
    }
  }

  if (!rootBean) return null

  const build = (bean: BeanSummary, depth: number): TreeNode => ({
    bean,
    children: (byParent.get(bean.id) ?? []).map((child) => build(child, depth + 1)),
    depth,
    isCurrentTask: false,
    worktreePath: '',
  })

  return build(rootBean, 0)
}

/**
 * Attach fleet lanes to epic nodes (and propagate to descendants as their
 * effective lane + worktree). The milestone root reads from `msWorktree`;
 * each epic and its descendants read from that epic's lane worktree. Marks the
 * lane's current task. Mutates the tree in place. Bean status is per-worktree
 * (the main repo is stale until merge), so callers must read each bean from
 * its `worktreePath`.
 */
export function attachLanes(
  root: TreeNode,
  laneByEpic: ReadonlyMap<string, LaneInfo>,
  msWorktree: string,
): void {
  const walk = (node: TreeNode, inheritedWt: string, inherited?: LaneInfo | undefined) => {
    const lane = node.bean.type === 'epic' ? laneByEpic.get(node.bean.id) : undefined
    node.lane = lane ?? inherited
    node.worktreePath = lane?.worktreePath ?? inheritedWt
    node.isCurrentTask = Boolean(node.lane && node.lane.currentTask === node.bean.id)
    for (const child of node.children) walk(child, node.worktreePath, node.lane)
  }

  walk(root, msWorktree)
}

/**
 * Pre-order flattening honoring an expanded-id set: a container's children are
 * included only when its id is in `expanded`. Returns the visible rows in
 * display order (root first).
 */
export function flattenTree(root: TreeNode, expanded: ReadonlySet<string>): TreeNode[] {
  const visible: TreeNode[] = []
  const walk = (node: TreeNode) => {
    visible.push(node)
    if (node.children.length > 0 && expanded.has(node.bean.id)) {
      for (const child of node.children) walk(child)
    }
  }

  walk(root)
  return visible
}

/** Default expansion: the root (milestone) open so its epics show. */
export function defaultExpanded(root: TreeNode): Set<string> {
  return new Set([root.bean.id])
}
