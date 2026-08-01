import Database from 'better-sqlite3'
/**
 * Live fleet-state readers for the TUI. `readFleetList` is a pure DB read
 * (mocha-tested). `readSnapshot` builds the full bean tree per fleet with
 * **per-worktree status** — bean status diverges across worktrees and the main
 * repo is stale until a lane merges, so each bean's status is read from the
 * worktree it lives in (milestone → ms worktree; epic/feature/task → their
 * epic's lane worktree). That I/O isn't unit-tested, but it only composes the
 * pure transforms in state.ts and bean-tree.ts.
 *
 * Imports only the broker storage layer + beans/herdr shells — no React, no
 * OpenTUI — so this never pulls the native renderer into the node/mocha path.
 */
import {execFileSync} from 'node:child_process'

import {activePaneIds} from '../herdr/pane.js'
import {type FleetRow, type LaneRow, listFleets, listLanes} from '../storage/fleets.js'
import {attachLanes, type BeanSummary, buildBeanTree, type LaneInfo, type TreeNode} from './bean-tree.js'
import {type FleetListItem, type TitleFor, toFleetList} from './state.js'

/**
 * Read every fleet (all projects) and its lanes from the broker DB, returning
 * the sorted view model (no bean titles). Pure DB read.
 */
export function readFleetList(db: Database.Database): FleetListItem[] {
  const fleets = listFleets(db)
  const lanes = fleets.flatMap((f) => listLanes(db, f.projectKey, f.milestoneBeanId))
  return toFleetList(fleets, lanes)
}

export interface FleetSnapshot {
  fleets: FleetListItem[]
  /** Full bean tree per fleet, keyed by milestone bean id (null if unbuilt). */
  treesByMilestone: Map<string, null | TreeNode>
}

/**
 * Fetch every bean in a repo/worktree via `beans list --json`, projected to
 * the fields the TUI uses. Tolerant: [] if beans is missing or cwd is invalid.
 */
function beanSummaries(cwd: string): BeanSummary[] {
  try {
    const raw = execFileSync('beans', ['list', '--json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const entries = JSON.parse(raw) as Array<Partial<BeanSummary>>
    return entries.map((bean) => ({
      id: bean.id ?? '',
      parent: bean.parent,
      priority: bean.priority ?? 'normal',
      status: bean.status ?? 'todo',
      title: bean.title ?? bean.id ?? '',
      type: bean.type ?? 'task',
    }))
  } catch {
    return []
  }
}

/**
 * Read this fleet's beans with authoritative per-worktree status. The ms
 * worktree holds the milestone; each lane worktree holds its epic + descendants
 * (features/tasks). Structure (parent/type/title) is merged across worktrees
 * (in-flight beans may exist only on a lane); status is taken from the
 * worktree of the nearest laned epic ancestor — or the ms worktree otherwise.
 */
function readFleetBeans(fleet: FleetRow, fleetLanes: LaneRow[]): BeanSummary[] {
  const msWt = fleet.worktreePath || fleet.projectRoot || ''
  const msSums = msWt ? beanSummaries(msWt) : []
  const laneSums = new Map<string, BeanSummary[]>()
  for (const lane of fleetLanes) {
    if (lane.worktreePath) laneSums.set(lane.epicBeanId, beanSummaries(lane.worktreePath))
  }

  // Union structure (prefer the ms worktree, then lanes for in-flight beans).
  const byId = new Map<string, BeanSummary>()
  for (const bean of msSums) byId.set(bean.id, bean)
  for (const sums of laneSums.values()) {
    for (const bean of sums) {
      if (!byId.has(bean.id)) byId.set(bean.id, bean)
    }
  }

  const msStatus = new Map(msSums.map((bean) => [bean.id, bean.status] as const))
  const laneStatusByEpic = new Map<string, Map<string, string>>()
  for (const [epic, sums] of laneSums) {
    laneStatusByEpic.set(epic, new Map(sums.map((bean) => [bean.id, bean.status] as const)))
  }

  const lanedEpics = new Set(laneSums.keys())
  const statusFor = (id: string): string => {
    let cursor: string | undefined = id
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor)
      if (lanedEpics.has(cursor)) {
        return laneStatusByEpic.get(cursor)!.get(id) ?? byId.get(id)?.status ?? 'todo'
      }

      cursor = byId.get(cursor)?.parent
    }

    return msStatus.get(id) ?? byId.get(id)?.status ?? 'todo'
  }

  return [...byId.values()].map((bean) => ({...bean, status: statusFor(bean.id)}))
}

/**
 * Full snapshot for one TUI poll: fleets + per-fleet bean trees (per-worktree
 * status, bean titles, per-lane agent-active state). Bean ids are globally
 * unique, so titles are merged across fleets into one map.
 */
export function readSnapshot(db: Database.Database): FleetSnapshot {
  const fleets = listFleets(db)
  const lanes = fleets.flatMap((f) => listLanes(db, f.projectKey, f.milestoneBeanId))
  const active = activePaneIds()

  const titles = new Map<string, string>()
  const treesByMilestone = new Map<string, null | TreeNode>()

  for (const fleet of fleets) {
    const fleetLanes = lanes.filter((l) => l.fleetMilestoneBeanId === fleet.milestoneBeanId)
    const summaries = readFleetBeans(fleet, fleetLanes)
    for (const bean of summaries) titles.set(bean.id, bean.title)

    const laneByEpic = new Map<string, LaneInfo>()
    for (const lane of fleetLanes) {
      laneByEpic.set(lane.epicBeanId, {
        agentActive: lane.paneId ? active.has(lane.paneId) : false,
        currentTask: lane.currentTaskBeanId,
        laneStatus: lane.status,
        paneId: lane.paneId ?? undefined,
        workspaceId: lane.workspaceId ?? undefined,
        worktreePath: lane.worktreePath,
      })
    }

    const tree = buildBeanTree(summaries, fleet.milestoneBeanId)
    if (tree) attachLanes(tree, laneByEpic, fleet.worktreePath || fleet.projectRoot || '')
    treesByMilestone.set(fleet.milestoneBeanId, tree)
  }

  const titleFor: TitleFor = (id) => titles.get(id)
  return {fleets: toFleetList(fleets, lanes, titleFor), treesByMilestone}
}
