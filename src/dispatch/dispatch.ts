/**
 * Dispatch helper (ADR-0009, ADR-0010).
 *
 * The dispatchable set for a fleet = descendants-of-milestone ∩ ready.
 * Readiness (status, dependencies, blockers) is beans' job — hordr
 * recomputes nothing. This module queries, intersects, and sorts.
 */
import {execFileSync} from 'node:child_process'

// --- binary path resolution (same pattern as beans/client.ts) ---
const BEANS_BIN = (() => {
  try {
    return execFileSync('sh', ['-c', 'command -v beans'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'beans'
  }
})()

// --- test seam ---
export type ShellFn = (args: string[], opts?: {cwd?: string}) => string

const defaultShell: ShellFn = (args, opts) =>
  execFileSync(BEANS_BIN, args, {
    cwd: opts?.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string

let _shell: ShellFn = defaultShell

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

// --- types ---

export interface DispatchableBean {
  assigned: string | undefined
  id: string
  priority: string
  title: string
  type: string
}

/** Only task and bug beans are executable — features, epics, milestones are containers. */
const EXECUTABLE_TYPES = new Set(['bug', 'feature', 'task'])

// --- priority ordering ---

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  deferred: 4,
  high: 1,
  low: 3,
  normal: 2,
}

function priorityRank(p: string): number {
  return PRIORITY_RANK[p] ?? 99
}

/** Sort: priority desc (critical first), then id asc (stable tiebreak). */
function byPriorityThenId(a: DispatchableBean, b: DispatchableBean): number {
  const rankDiff = priorityRank(a.priority) - priorityRank(b.priority)
  if (rankDiff !== 0) return rankDiff
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// --- pure logic ---

/**
 * Intersection of descendants ∩ ready ∩ executable, sorted by priority then id.
 *  Features with children are containers — excluded from dispatch.
 */
export function pickDispatchable(
  descendants: DispatchableBean[],
  ready: DispatchableBean[],
  containerIds?: Set<string>,
): DispatchableBean[] {
  const descendantIds = new Set(descendants.map((d) => d.id))
  return ready
    .filter((r) => {
      if (!descendantIds.has(r.id)) return false
      if (!EXECUTABLE_TYPES.has(r.type)) return false
      // Features with children are containers, not work items
      if (r.type === 'feature' && containerIds?.has(r.id)) return false
      return true
    })
    .sort(byPriorityThenId)
}

// --- tree flattening ---

interface RawBean {
  assigned?: string
  children?: RawBean[]
  id: string
  priority?: string
  title?: string
  type?: string
}

/** Recursively flatten a bean tree. Collects IDs of beans that have children (containers). */
function flattenDescendants(node: RawBean, containerIds: Set<string>): DispatchableBean[] {
  const result: DispatchableBean[] = []
  for (const child of node.children ?? []) {
    const hasChildren = (child.children?.length ?? 0) > 0
    if (hasChildren) containerIds.add(child.id)
    result.push(
      {
        assigned: child.assigned,
        id: child.id,
        priority: child.priority ?? 'normal',
        title: child.title ?? '',
        type: child.type ?? 'task',
      },
      ...flattenDescendants(child, containerIds),
    )
  }

  return result
}

// --- I/O: query beans ---

/** Fetch the subtree and flatten to a list. Returns descendants + container IDs. */
function fetchDescendants(
  rootBeanId: string,
  cwd?: string,
): {containerIds: Set<string>; descendants: DispatchableBean[]} {
  const query = `{ bean(id: "${rootBeanId}") { children { id title type priority children { id title type priority children { id title type priority } } } } }`
  const raw = _shell(['query', '--json', query], {cwd})
  const data = JSON.parse(raw) as {bean?: RawBean}
  if (!data.bean) return {containerIds: new Set(), descendants: []}
  const containerIds = new Set<string>()
  const descendants = flattenDescendants(data.bean, containerIds)
  return {containerIds, descendants}
}

interface DraftBean {
  id: string
  status: string
  title?: string
}

/**
 * Beans under the milestone with status == 'draft' (ADR-0013). These await
 * human review before they can be dispatched. Reuses the dispatch shell seam.
 */
export function listDrafts(milestoneId: string, opts?: {cwd?: string}): Array<{id: string; title: string}> {
  const query = `{ bean(id: "${milestoneId}") { children { id title status children { id title status children { id title status } } } } }`
  const raw = _shell(['query', '--json', query], {cwd: opts?.cwd})
  const data = JSON.parse(raw) as {bean?: {children?: DraftBean[]}}

  const drafts: Array<{id: string; title: string}> = []
  const walk = (nodes: DraftBean[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.status === 'draft') drafts.push({id: node.id, title: node.title ?? ''})
      // children aren't returned by this fixed-depth query for draft leaves, but
      // walk anyway in case a draft has its own subtree.
      walk((node as unknown as {children?: DraftBean[]}).children)
    }
  }

  walk(data.bean?.children)
  return drafts
}

/** Direct children of a bean with their status (milestone → epics). */
export function fetchChildStatuses(beanId: string, opts?: {cwd?: string}): Array<{id: string; status: string}> {
  const query = `{ bean(id: "${beanId}") { children { id status } } }`
  const raw = _shell(['query', '--json', query], {cwd: opts?.cwd})
  const data = JSON.parse(raw) as {bean?: {children?: Array<{id: string; status: string}>}}
  return data.bean?.children ?? []
}

/** The milestone's direct children as epic infos (for the lane scanner). */
export function fetchEpics(milestoneId: string, opts?: {cwd?: string}): Array<{id: string; title: string}> {
  const query = `{ bean(id: "${milestoneId}") { children { id title } } }`
  const raw = _shell(['query', '--json', query], {cwd: opts?.cwd})
  const data = JSON.parse(raw) as {bean?: {children?: Array<{id: string; title?: string}>}}
  return (data.bean?.children ?? []).map((c) => ({id: c.id, title: c.title ?? ''}))
}

interface AncestorNode {
  children?: Array<{id: string; status: string}>
  id: string
  parent?: AncestorNode
  status: string
  type: string
}

/**
 * A task's ancestor chain (nearest-first) with each ancestor's subtree
 * completion, stopping at the epic level (per-epic model, ADR-0014). Feeds
 * rollup(): the daemon marks each ancestor completed when its subtree is done.
 */
export function fetchAncestry(
  taskId: string,
  opts?: {cwd?: string},
): Array<{descendantsAllCompleted: boolean; id: string; status: string}> {
  const query = `{ bean(id: "${taskId}") { parent { id type status children { id status } parent { id type status children { id status } } } } }`
  const raw = _shell(['query', '--json', query], {cwd: opts?.cwd})
  const data = JSON.parse(raw) as {bean?: {parent?: AncestorNode}}

  const result: Array<{descendantsAllCompleted: boolean; id: string; status: string}> = []
  let node = data.bean?.parent
  while (node) {
    const children = node.children ?? []
    const allDone = children.length > 0 && children.every((c) => c.status === 'completed')
    result.push({descendantsAllCompleted: allDone, id: node.id, status: node.status})
    if (node.type === 'epic') break // stop at epic — milestone-level is fleet finish's job
    node = node.parent
  }

  return result
}

/** Fetch the globally-ready beans (readiness is beans' job). */
function fetchReady(cwd?: string): DispatchableBean[] {
  const raw = _shell(['list', '--ready', '--json'], {cwd})
  const data = JSON.parse(raw) as DispatchableBean[]
  return data
}

// --- public API ---

/** Get the sorted list of dispatchable beans under a subtree root (epic or milestone). */
export function getDispatchable(rootBeanId: string, opts?: {cwd?: string}): DispatchableBean[] {
  const {containerIds, descendants} = fetchDescendants(rootBeanId, opts?.cwd)
  const ready = fetchReady(opts?.cwd)
  return pickDispatchable(descendants, ready, containerIds)
}
