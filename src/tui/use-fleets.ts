import Database from 'better-sqlite3'
/**
 * React hook that polls the broker DB for the fleet snapshot. Part of the
 * OpenTUI layer (imports React) but NOT OpenTUI itself — it never touches the
 * native renderer, only the storage + beans/herdr shells. Loaded only when the
 * TUI runs.
 */
import {useEffect, useRef, useState} from 'react'

import {openFleetDb} from '../storage/db.js'
import {type FleetSnapshot, readSnapshot} from './data.js'

export interface FleetStore {
  fleets: FleetSnapshot['fleets']
  lanesByMilestone: FleetSnapshot['lanesByMilestone']
  /** Force an immediate re-read (used after running an action). */
  refresh: () => void
}

const EMPTY: FleetSnapshot = {fleets: [], lanesByMilestone: new Map()}

/** Poll the fleet snapshot every `intervalMs` (default 2s). Observer-only. */
export function useFleets(intervalMs = 2000): FleetStore {
  const [snapshot, setSnapshot] = useState<FleetSnapshot>(EMPTY)
  const dbRef = useRef<Database.Database | undefined>(undefined)

  useEffect(() => {
    const db = openFleetDb()
    dbRef.current = db
    const refresh = () => setSnapshot(readSnapshot(db))
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => {
      clearInterval(id)
      db.close()
    }
  }, [intervalMs])

  const refresh = () => {
    if (dbRef.current) setSnapshot(readSnapshot(dbRef.current))
  }

  return {fleets: snapshot.fleets, lanesByMilestone: snapshot.lanesByMilestone, refresh}
}
