/**
 * Tick-driven lane scanner (ADR-0014).
 *
 * On each daemon tick: for each epic under the milestone, check if it has
 * ready work AND no existing lane. If so, it needs a worktree (created
 * lazily from the milestone integration branch). Pure function with
 * injected deps — the daemon wires beans queries + SQLite.
 */
export interface EpicInfo {
  id: string
  title: string
}

export interface ScanDeps {
  /** Fetch the milestone's direct child epics. */
  fetchEpics: (milestoneId: string) => EpicInfo[]
  /** Whether the epic has at least one ready (unblocked + todo) task. */
  hasReadyWork: (epicId: string) => boolean
  /** Whether a lane (worktree + dispatch loop) already exists for this epic. */
  laneExists: (epicId: string) => boolean
}

/** Return epics that need a lane: have ready work AND no existing lane. */
export function scanForNewLanes(milestoneId: string, deps: ScanDeps): EpicInfo[] {
  const epics = deps.fetchEpics(milestoneId)
  return epics.filter((epic) => !deps.laneExists(epic.id) && deps.hasReadyWork(epic.id))
}
