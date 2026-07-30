import Database from 'better-sqlite3'
/**
 * React hook that polls the broker DB for the fleet list. Part of the OpenTUI
 * layer (imports React) but NOT OpenTUI itself — it never touches the native
 * renderer, only the storage module. Loaded only when the TUI runs.
 */
import {useEffect, useRef, useState} from 'react'

import type {FleetListItem} from './state.js'

import {openFleetDb} from '../storage/db.js'
import {readFleetList} from './data.js'

export interface FleetStore {
  items: FleetListItem[]
  /** Force an immediate re-read (used after running an action). */
  refresh: () => void
}

/** Poll the fleet list every `intervalMs` (default 2s). Observer-only. */
export function useFleets(intervalMs = 2000): FleetStore {
  const [items, setItems] = useState<FleetListItem[]>([])
  const dbRef = useRef<Database.Database | undefined>(undefined)

  useEffect(() => {
    const db = openFleetDb()
    dbRef.current = db
    const refresh = () => setItems(readFleetList(db))
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => {
      clearInterval(id)
      db.close()
    }
  }, [intervalMs])

  const refresh = () => {
    if (dbRef.current) setItems(readFleetList(dbRef.current))
  }

  return {items, refresh}
}
