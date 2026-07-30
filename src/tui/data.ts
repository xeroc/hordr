/**
 * Live fleet-list reader for the TUI. Imports only the broker storage layer
 * (better-sqlite3) — no React, no OpenTUI — so it is mocha/node testable and
 * the pure {@link toFleetList} transform stays the single source of truth for
 * the view model.
 */
import Database from 'better-sqlite3'

import {listFleets, listLanes} from '../storage/fleets.js'
import {type FleetListItem, toFleetList} from './state.js'

/**
 * Read every fleet (all projects) and its lanes from the broker DB, returning
 * the sorted view model. Callers own the DB handle (the React hook opens it
 * once and polls; tests pass a :memory: handle).
 */
export function readFleetList(db: Database.Database): FleetListItem[] {
  const fleets = listFleets(db)
  const lanes = fleets.flatMap((f) => listLanes(db, f.projectKey, f.milestoneBeanId))
  return toFleetList(fleets, lanes)
}
