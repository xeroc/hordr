/**
 * Pure view-model + navigation for the fleet TUI. Deliberately has NO OpenTUI
 * imports: the native renderer needs Bun/FFI, but these transforms do not, so
 * the mocha/node suite (npm test) covers them directly. The React components
 * in src/tui/*.tsx are a thin presentation layer over these functions.
 */
import type {FleetRow, LaneRow} from '../storage/fleets.js'

export interface FleetListItem {
  branch: string
  laneCount: number
  milestone: string
  paneId?: string
  projectKey: string
  status: string
}

/**
 * Sort rank for the fleet list: in-flight work first, blocked/uncommitted
 * next, quarantined (broken) after that, terminal (done) last. Lower = higher
 * up. Unknown statuses sort just above terminal so new states stay visible.
 */
export function statusRank(status: string): number {
  switch (status) {
    case 'active': {
      return 0
    }

    case 'blocked': {
      return 2
    }

    case 'broken': {
      return 3
    }

    case 'done': {
      return 5
    }

    case 'merging': {
      return 1
    }

    case 'uncommitted': {
      return 2
    }

    default: {
      return 4
    }
  }
}

/**
 * Build the fleet-list view model from storage rows, grouping lanes by their
 * fleet milestone. Sorted by status rank (in-flight first), then milestone id
 * for a stable order. Pure — no I/O.
 */
export function toFleetList(fleets: readonly FleetRow[], lanes: readonly LaneRow[]): FleetListItem[] {
  const laneCounts = new Map<string, number>()
  for (const lane of lanes) {
    const key = lane.fleetMilestoneBeanId
    laneCounts.set(key, (laneCounts.get(key) ?? 0) + 1)
  }

  return fleets
    .map((f) => ({
      branch: f.branch,
      laneCount: laneCounts.get(f.milestoneBeanId) ?? 0,
      milestone: f.milestoneBeanId,
      paneId: f.paneId ?? undefined,
      projectKey: f.projectKey,
      status: f.status,
    }))
    .sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || a.milestone.localeCompare(b.milestone),
    )
}

/**
 * Clamp a cursor movement within a list of `len` items (no wrapping —
 * predictable at the edges). Returns -1 for an empty list so callers can
 * render an "no fleets" state.
 */
export function moveCursor(index: number, len: number, delta: number): number {
  if (len <= 0) return -1
  return Math.max(0, Math.min(len - 1, index + delta))
}
