/**
 * Dispatch helper (ADR-0009, ADR-0010).
 *
 * The dispatchable set for a fleet = descendants-of-milestone ∩ ready.
 * Readiness (status, dependencies, blockers) is beans' job — hordr
 * recomputes nothing. This module queries, intersects, and sorts.
 */
import {execFileSync} from 'node:child_process'

// --- test seam ---
export type ShellFn = (args: string[], opts?: {cwd?: string}) => string

const defaultShell: ShellFn = (args, opts) =>
  execFileSync('beans', args, {
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
}

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

/** Intersection of descendants ∩ ready, sorted by priority then id. */
export function pickDispatchable(descendants: DispatchableBean[], ready: DispatchableBean[]): DispatchableBean[] {
  const descendantIds = new Set(descendants.map((d) => d.id))
  return ready.filter((r) => descendantIds.has(r.id)).sort(byPriorityThenId)
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

/** Recursively flatten a bean tree into a list of all descendant ids. */
function flattenDescendants(node: RawBean): DispatchableBean[] {
  const result: DispatchableBean[] = []
  for (const child of node.children ?? []) {
    result.push(
      {
        assigned: child.assigned,
        id: child.id,
        priority: child.priority ?? 'normal',
        title: child.title ?? '',
      },
      ...flattenDescendants(child),
    )
  }

  return result
}

// --- I/O: query beans ---

/** Fetch the milestone's descendant tree and flatten to a list. */
function fetchDescendants(milestoneId: string, cwd?: string): DispatchableBean[] {
  // Fixed-depth nesting (3 levels: milestone → epic → task). Deeper trees
  // need more levels; a recursive-descent beans query would be cleaner.
  const query = `{ bean(id: "${milestoneId}") { children { id title type assigned priority children { id title type assigned priority children { id title type assigned priority } } } } }`
  const raw = _shell(['query', '--json', query], {cwd})
  const data = JSON.parse(raw) as {bean?: RawBean}
  return data.bean ? flattenDescendants(data.bean) : []
}

/** Fetch the globally-ready beans (readiness is beans' job). */
function fetchReady(cwd?: string): DispatchableBean[] {
  const raw = _shell(['list', '--ready', '--json'], {cwd})
  const data = JSON.parse(raw) as DispatchableBean[]
  return data
}

// --- public API ---

/** Get the sorted list of dispatchable task beans under a subtree root (epic or milestone). */
export function getDispatchable(rootBeanId: string, opts?: {cwd?: string}): DispatchableBean[] {
  const descendants = fetchDescendants(rootBeanId, opts?.cwd)
  const ready = fetchReady(opts?.cwd)
  return pickDispatchable(descendants, ready)
}
