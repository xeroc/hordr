import Database from 'better-sqlite3'
/**
 * Live fleet-state readers for the TUI. `readFleetList` is a pure DB read
 * (mocha-tested). `readSnapshot` enriches it with bean titles and builds the
 * full nested bean tree per fleet (milestone → epic → feature → task, every
 * level) with fleet lanes attached — that I/O is not unit-tested, but it only
 * composes the pure transforms in state.ts and bean-tree.ts.
 *
 * Imports only the broker storage layer + beans/herdr shells — no React, no
 * OpenTUI — so this never pulls the native renderer into the node/mocha path.
 */
import {execFileSync} from 'node:child_process'

import {activePaneIds} from '../herdr/pane.js'
import {listFleets, listLanes} from '../storage/fleets.js'
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
 * Fetch every bean in a repo via `beans list --json`, projected to the fields
 * the TUI uses (including `parent` + `type`, which let the tree be rebuilt
 * client-side). Tolerant: returns [] if beans is missing or the cwd isn't a
 * beans repo (e.g. a fleet row with a stale project root).
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
 * Full snapshot for one TUI poll: fleets + per-fleet bean trees, enriched with
 * bean titles and per-lane agent-active state. Bean ids are globally unique,
 * so titles/summaries are cached per project root and merged across fleets.
 */
export function readSnapshot(db: Database.Database): FleetSnapshot {
  const fleets = listFleets(db)
  const lanes = fleets.flatMap((f) => listLanes(db, f.projectKey, f.milestoneBeanId))
  const active = activePaneIds()

  const summaryCache = new Map<string, BeanSummary[]>()
  const titles = new Map<string, string>()
  const treesByMilestone = new Map<string, null | TreeNode>()

  for (const fleet of fleets) {
    const root = fleet.projectRoot
    let tree: null | TreeNode = null
    if (root) {
      const summaries = summaryCache.get(root) ?? beanSummaries(root)
      summaryCache.set(root, summaries)
      for (const bean of summaries) titles.set(bean.id, bean.title)

      const laneByEpic = new Map<string, LaneInfo>()
      for (const lane of lanes.filter((l) => l.fleetMilestoneBeanId === fleet.milestoneBeanId)) {
        laneByEpic.set(lane.epicBeanId, {
          agentActive: lane.paneId ? active.has(lane.paneId) : false,
          currentTask: lane.currentTaskBeanId,
          laneStatus: lane.status,
          paneId: lane.paneId ?? undefined,
          workspaceId: lane.workspaceId ?? undefined,
        })
      }

      tree = buildBeanTree(summaries, fleet.milestoneBeanId)
      if (tree) attachLanes(tree, laneByEpic)
    }

    treesByMilestone.set(fleet.milestoneBeanId, tree)
  }

  const titleFor: TitleFor = (id) => titles.get(id)
  return {fleets: toFleetList(fleets, lanes, titleFor), treesByMilestone}
}
