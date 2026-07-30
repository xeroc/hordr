import Database from 'better-sqlite3'
/**
 * Live fleet-state readers for the TUI. `readFleetList` is a pure DB read
 * (mocha-tested). `readSnapshot` enriches it with bean titles (via the beans
 * CLI) and per-lane agent-active state (via one herdr pane list) — that I/O is
 * not unit-tested, but it only composes the pure transforms in state.ts.
 *
 * Imports only the broker storage layer + beans/herdr shells — no React, no
 * OpenTUI — so this never pulls the native renderer into the node/mocha path.
 */
import {execFileSync} from 'node:child_process'

import {activePaneIds} from '../herdr/pane.js'
import {listFleets, listLanes} from '../storage/fleets.js'
import {type FleetListItem, type LaneItem, type TitleFor, toFleetList, toLaneList} from './state.js'

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
  /** Per-fleet lane list, keyed by milestone bean id. */
  lanesByMilestone: Map<string, LaneItem[]>
}

/**
 * Build a bean id → title map for one repo via `beans list --json`. Tolerant:
 * returns an empty map if beans is missing or the cwd isn't a beans repo (e.g.
 * a fleet row with a stale project root).
 */
function beanTitleMap(cwd: string): Map<string, string> {
  try {
    const raw = execFileSync('beans', ['list', '--json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const entries = JSON.parse(raw) as Array<{id?: string; title?: string}>
    const titles = new Map<string, string>()
    for (const bean of entries) {
      if (bean.id && bean.title) titles.set(bean.id, bean.title)
    }

    return titles
  } catch {
    return new Map()
  }
}

/**
 * Full snapshot for one TUI poll: fleets + per-fleet lanes, enriched with bean
 * titles (milestones + epics) and per-lane agent-active state. Bean ids are
 * globally unique, so titles are merged across projects into one map.
 */
export function readSnapshot(db: Database.Database): FleetSnapshot {
  const fleets = listFleets(db)
  const lanes = fleets.flatMap((f) => listLanes(db, f.projectKey, f.milestoneBeanId))

  const titles = new Map<string, string>()
  for (const fleet of fleets) {
    if (fleet.projectRoot) {
      for (const [id, title] of beanTitleMap(fleet.projectRoot)) titles.set(id, title)
    }
  }

  const titleFor: TitleFor = (id) => titles.get(id)
  const active = activePaneIds()

  const lanesByMilestone = new Map<string, LaneItem[]>()
  for (const fleet of fleets) {
    const fleetLanes = lanes.filter((l) => l.fleetMilestoneBeanId === fleet.milestoneBeanId)
    lanesByMilestone.set(fleet.milestoneBeanId, toLaneList(fleetLanes, titleFor, active))
  }

  return {fleets: toFleetList(fleets, lanes, titleFor), lanesByMilestone}
}
