/**
 * Tick-driven lane scanner (ADR-0014).
 *
 * On each daemon tick: for each epic under the milestone, check if its own
 * epic-level blockers are satisfied AND it has ready work AND no existing
 * lane. If so, it needs a worktree (created lazily from the milestone
 * integration branch, so it inherits merged blockers by construction).
 * Pure function with injected deps — the daemon wires beans queries + SQLite.
 */
export interface EpicInfo {
  id: string
  title: string
}

export interface ScanDeps {
  /**
   * Whether the epic's OWN `--blocked-by` blockers are all completed
   * (hordr-dkl1). beans' `--ready` does not propagate an epic's blockers to
   * its child tasks, so hasReadyWork alone would hand a cross-epic-blocked
   * epic a worktree off any one clean task.
   */
  epicBlockersSatisfied: (epicId: string) => boolean
  /** Fetch the milestone's direct child epics. */
  fetchEpics: (milestoneId: string) => EpicInfo[]
  /** Whether the epic has at least one ready (unblocked + todo) task. */
  hasReadyWork: (epicId: string) => boolean
  /** Whether a lane (worktree + dispatch loop) already exists for this epic. */
  laneExists: (epicId: string) => boolean
}

/** Return epics that need a lane: unblocked + ready work + no existing lane. */
export function scanForNewLanes(milestoneId: string, deps: ScanDeps): EpicInfo[] {
  const epics = deps.fetchEpics(milestoneId)
  return epics.filter(
    (epic) =>
      deps.epicBlockersSatisfied(epic.id) &&
      !deps.laneExists(epic.id) &&
      deps.hasReadyWork(epic.id),
  )
}
