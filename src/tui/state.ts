/**
 * Pure view-model + navigation for the fleet TUI. Deliberately has NO OpenTUI
 * imports: the native renderer needs Bun/FFI, but these transforms do not, so
 * the mocha/node suite (npm test) covers them directly. The React components
 * in src/tui/*.tsx are a thin presentation layer over these functions.
 *
 * Bean titles and agent-active state are injected as callbacks/sets so the
 * pure transforms stay testable without shelling out to beans or herdr.
 */
import type {FleetRow, LaneRow} from '../storage/fleets.js'

export interface FleetListItem {
  branch: string
  laneCount: number
  milestone: string
  paneId?: string
  projectKey: string
  status: string
  /** Bean title (falls back to the milestone id when no title is known). */
  title: string
}

export interface LaneItem {
  /** True when an agent session is registered in this lane's pane right now. */
  agentActive: boolean
  branch: string
  currentTask: null | string
  epic: string
  paneId?: string
  status: string
  title: string
}

/** Lookup a bean title by id; returns undefined when unknown. */
export type TitleFor = (id: string) => string | undefined

/**
 * Sort rank for the fleet/lane list: in-flight work first, blocked/uncommitted
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
 * fleet milestone. Sorted by status rank (in-flight first), then milestone id.
 * `titleFor` injects bean titles; absent → the milestone id is used.
 */
export function toFleetList(
  fleets: readonly FleetRow[],
  lanes: readonly LaneRow[],
  titleFor?: TitleFor,
): FleetListItem[] {
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
      title: titleFor?.(f.milestoneBeanId) ?? f.milestoneBeanId,
    }))
    .sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || a.milestone.localeCompare(b.milestone),
    )
}

/**
 * Build the per-fleet lane (epic) view model. `titleFor` injects epic titles;
 * `activePanes` carries the set of pane ids with a live agent so each lane
 * shows whether an agent is actively working in it. Sorted by status rank.
 */
export function toLaneList(
  lanes: readonly LaneRow[],
  titleFor?: TitleFor,
  activePanes?: ReadonlySet<string>,
): LaneItem[] {
  return lanes
    .map((l) => ({
      agentActive: l.paneId ? (activePanes?.has(l.paneId) ?? false) : false,
      branch: l.branch,
      currentTask: l.currentTaskBeanId,
      epic: l.epicBeanId,
      paneId: l.paneId ?? undefined,
      status: l.status,
      title: titleFor?.(l.epicBeanId) ?? l.epicBeanId,
    }))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.epic.localeCompare(b.epic))
}

/**
 * Clamp a cursor movement within a list of `len` items (no wrapping —
 * predictable at the edges). Returns -1 for an empty list so callers can
 * render an empty state.
 */
export function moveCursor(index: number, len: number, delta: number): number {
  if (len <= 0) return -1
  return Math.max(0, Math.min(len - 1, index + delta))
}
