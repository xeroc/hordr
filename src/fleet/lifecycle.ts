/**
 * Fleet lifecycle orchestration (ADR-0009, ADR-0014).
 *
 * Pure-ish functions that compose the storage repository + git + daemon into
 * the operations the `hordr fleet` commands drive. Each takes an open
 * `Database` (tests use :memory:) and a deps object (git, beans, daemon) so
 * nothing here shells out directly. Lane/worktree creation is deliberately
 * NOT done here — per ADR-0014 it is tick-driven and owned by the daemon.
 */
import type Database from 'better-sqlite3'

import type {BeanRecord} from '../beans/client.js'

import {commitBeanChanges} from '../dispatch/commit-beans.js'
import {attemptMerge, type GitFn} from '../dispatch/merge.js'
import {areAllEpicsCompleted, isMilestoneComplete} from '../dispatch/rollup.js'
import {logger} from '../logger.js'
import {
  deleteFleet,
  deleteLanes,
  ensureProject,
  type FleetRow,
  getFleet,
  type LaneLoc,
  type LaneRow,
  listLanes,
  registerFleet,
  setFleetPane,
  setLaneWorktree,
  updateFleetStatus,
  updateLaneStatus,
} from '../storage/fleets.js'

export class FleetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FleetError'
  }
}

export interface ProjectInfo {
  beansPath: string
  companyPath: null | string
  configPath: string
  projectKey: string
}

export interface CreateFleetDeps {
  /** Create a herdr worktree for the ms branch; return its path. */
  createWorktree: (opts: {base: string; branch: string; cwd: string}) => {path: string; workspaceId: string}
  fetchBean: (id: string) => BeanRecord
  git: GitFn
  /** Recover when createWorktree reports the branch already exists (partial-failure retry). */
  openWorktree: (opts: {branch: string; cwd: string}) => {path: string; workspaceId: string}
}

export interface CreateFleetResult {
  branch: string
}

/**
 * Bootstrap a fleet for a milestone: validate the bean is a milestone, create
 * the milestone integration branch from primary, and register the fleet row.
 * Refuses if an active fleet already exists.
 *
 * Does NOT create lanes/worktrees — `hordr fleet check` does that lazily as
 * epics become unblocked (ADR-0014). The `fleet create` command runs one check
 * pass right after this so lanes spawn immediately (ADR-0015).
 */
export async function createFleet(
  db: Database.Database,
  milestoneId: string,
  opts: {cwd: string; primaryBranch: string; project: ProjectInfo},
  deps: CreateFleetDeps,
): Promise<CreateFleetResult> {
  const bean = deps.fetchBean(milestoneId)
  if (bean.type !== 'milestone') {
    throw new FleetError(`${milestoneId} is type '${bean.type}', not 'milestone'`)
  }

  ensureProject(db, opts.project)

  const existing = getFleet(db, opts.project.projectKey, milestoneId)
  if (existing?.status === 'active') {
    throw new FleetError(`fleet for ${milestoneId} is already active (branch ${existing.branch})`)
  }

  const branch = milestoneId

  // Create the ms branch + worktree in one shot: herdr worktree create
  // --branch <milestoneId> --base <primary>. The worktree IS on the milestone
  // branch — epic merges land here, the scanner reads from here. Falls back
  // to openWorktree when the branch already exists (partial-failure retry).
  let msWt: {path: string; workspaceId: string}
  try {
    msWt = deps.createWorktree({base: opts.primaryBranch, branch, cwd: opts.cwd})
  } catch (error) {
    if (!/already exists/i.test((error as Error).message)) throw error
    msWt = deps.openWorktree({branch, cwd: opts.cwd})
  }

  registerFleet(db, {
    branch,
    createdAt: new Date().toISOString(),
    milestoneBeanId: milestoneId,
    projectKey: opts.project.projectKey,
    projectRoot: opts.cwd,
    status: 'active',
    worktreePath: msWt.path,
  })

  return {branch}
}

export interface FleetSnapshot {
  fleet: FleetRow
  lanes: LaneRow[]
}

/**
 * Read the fleet + its lanes for `fleet status`. Throws FleetError if no fleet
 * row exists for the milestone. Read-only — no beans/git calls.
 */
export function describeFleet(db: Database.Database, projectKey: string, milestoneId: string): FleetSnapshot {
  const fleet = getFleet(db, projectKey, milestoneId)
  if (!fleet) {
    throw new FleetError(`no fleet for ${milestoneId} (project ${projectKey})`)
  }

  return {fleet, lanes: listLanes(db, projectKey, milestoneId)}
}

export interface FinishFleetDeps {
  /** Beans data dir name (e.g., '.beans'), resolved from the worktree's config. */
  beansDir: (worktreePath: string) => string
  /** Status of a bean in the worktree ('completed', 'todo', …). */
  beanStatus: (id: string) => string | undefined
  /** The milestone's direct children (epics) with their status. */
  fetchEpicStatuses: (id: string) => Array<{id: string; status: string}>
  /** List files with unresolved merge conflicts in a worktree. */
  getConflictedFiles: (worktreePath: string) => string[]
  git: GitFn
  /**
   * Remove the milestone worktree by path via `git worktree remove` (no
   * --force). Tolerant of an already-gone worktree. Called only after the
   * milestone + all epics are confirmed completed and the ms→primary merge
   * has landed. opts.cwd is set to mainRepoCwd so git discovers the repo
   * even when hordr runs from a non-git directory (hordr-ppsp).
   */
  removeWorktree: (worktreePath: string, opts?: {cwd?: string}) => void
  /**
   * Spawn a merger agent in the ms worktree to resolve ms→primary conflicts.
   * Returns the pane ID for liveness tracking. Called only on tier-3 conflict.
   */
  spawnMerger: (opts: {conflictedFiles: string[]; cwd: string; mainRepoCwd: string}) => string
}

export interface FinishFleetResult {
  branch: string
  /** Pane ID of the spawned merger agent (present when tier-3 conflict escalation fired). */
  conflictPaneId?: string
  merged: boolean
}

/**
 * Finish a fleet: assert the milestone + all its epics are completed, merge
 * ms/<id> into primary using the 3-tier strategy (ff-only → no-ff → spawn
 * merger agent on conflict), tear down the milestone worktree + branch, then
 * delete the lane + fleet rows.
 *
 * On tier 1/2 success: worktree + branch removed, rows deleted, returns
 * {merged: true}. On tier 3 conflict: spawns a merger agent, sets fleet →
 * 'merging', returns {merged: false, conflictPaneId}. The engine's tick loop
 * (`hordr fleet check`) detects completion and finishes the teardown.
 *
 * Refuses if the milestone isn't complete or any epic is still open.
 */
export function finishFleet(
  db: Database.Database,
  milestoneId: string,
  opts: {cwd: string; mainRepoCwd: string; primaryBranch: string; projectKey: string},
  deps: FinishFleetDeps,
): FinishFleetResult {
  const fleet = getFleet(db, opts.projectKey, milestoneId)
  if (!fleet) {
    throw new FleetError(`no fleet for ${milestoneId} (project ${opts.projectKey})`)
  }

  if (fleet.status === 'merging') {
    throw new FleetError(
      `fleet ${milestoneId} is already merging — merger agent running (pane=${fleet.paneId}). ` +
        `Run 'hordr fleet check' to complete.`,
    )
  }

  if (!isMilestoneComplete(milestoneId, {beanStatus: deps.beanStatus})) {
    throw new FleetError(`milestone ${milestoneId} is not completed — rollup must close it first`)
  }

  if (!areAllEpicsCompleted(milestoneId, {fetchEpicStatuses: deps.fetchEpicStatuses})) {
    throw new FleetError(`not all epics under ${milestoneId} are completed`)
  }

  const outcome = attemptMerge({cwd: opts.cwd, source: milestoneId, target: opts.primaryBranch}, {git: deps.git})

  if (outcome.status === 'conflict') {
    // Tier 3: spawn merger agent. The worktree is left on the primary branch
    // with the conflicted merge in progress.
    const conflictedFiles = deps.getConflictedFiles(fleet.worktreePath)
    const paneId = deps.spawnMerger({
      conflictedFiles,
      cwd: fleet.worktreePath,
      mainRepoCwd: opts.mainRepoCwd,
    })
    setFleetPane(db, opts.projectKey, milestoneId, paneId)
    updateFleetStatus(db, opts.projectKey, milestoneId, 'merging')
    logger.info(
      `fleet ${milestoneId}: ms→primary merge conflict — spawned merger agent (pane=${paneId}, ` +
        `${conflictedFiles.length} conflicted file(s)). Run 'hordr fleet check' to complete.`,
    )
    return {branch: fleet.branch, conflictPaneId: paneId, merged: false}
  }

  // Tier 1/2 success — tear down.
  finishFleetTeardown(db, fleet, opts, deps)
  return {branch: fleet.branch, merged: true}
}

/**
 * Post-merge fleet teardown: defensive beans commit, worktree removal, branch
 * deletion, row cleanup. Shared by the immediate-success path (finishFleet)
 * and the post-merger-resolution path (engine tick loop).
 *
 * Branch deletion uses `-d` (safe delete, NOT -D): refuses unmerged branches,
 * which catches silent no-op merges. Run from mainRepoCwd because the ms
 * worktree is already gone at this point.
 */
export function finishFleetTeardown(
  db: Database.Database,
  fleet: FleetRow,
  opts: {mainRepoCwd: string},
  deps: {
    beansDir: (worktreePath: string) => string
    git: GitFn
    removeWorktree: (worktreePath: string, opts?: {cwd?: string}) => void
  },
): void {
  // Defensive commit: mop up any straggler .beans/ writes so `git worktree
  // remove` (no --force) doesn't refuse on dirty-modified (hordr-hmbq).
  if (fleet.worktreePath) {
    commitBeanChanges({beansDir: deps.beansDir(fleet.worktreePath), cwd: fleet.worktreePath}, {git: deps.git})
    deps.removeWorktree(fleet.worktreePath, {cwd: opts.mainRepoCwd})
  }

  // Branch deletion: -d (safe delete). The merge already landed; orphaned
  // refs are manual cleanup if this fails (e.g. worktree still holds the ref).
  try {
    deps.git(['branch', '-d', fleet.branch], {cwd: opts.mainRepoCwd})
  } catch (error) {
    logger.warn(
      `fleet ${fleet.milestoneBeanId}: branch '${fleet.branch}' not deleted: ${(error as Error).message}. ` +
        `Merge landed in ${opts.mainRepoCwd}; orphaned ref needs manual cleanup.`,
    )
  }

  deleteLanes(db, fleet.projectKey, fleet.milestoneBeanId)
  deleteFleet(db, fleet.projectKey, fleet.milestoneBeanId)
}

export interface AbortFleetDeps {
  git: GitFn
  /**
   * Remove a lane's worktree by its branch. Tolerant: a no-op if the worktree
   * is already gone (lane was 'done' / merged). Only called with --force.
   */
  removeWorktree: (branch: string) => void
}

export interface AbortFleetResult {
  branch: string
  worktreesRemoved: number
}

/**
 * Abort a fleet: delete all lane rows + the fleet row so the daemon's tick
 * stops dispatching (no fleet row → no loops). By default worktrees are kept
 * (work preserved for manual inspection); --force also removes every lane
 * worktree and deletes the ms/<id> branch. Beans are always kept for retry.
 */
export function abortFleet(
  db: Database.Database,
  milestoneId: string,
  opts: {cwd: string; force: boolean; projectKey: string},
  deps: AbortFleetDeps,
): AbortFleetResult {
  const fleet = getFleet(db, opts.projectKey, milestoneId)
  if (!fleet) {
    throw new FleetError(`no fleet for ${milestoneId} (project ${opts.projectKey})`)
  }

  const lanes = listLanes(db, opts.projectKey, milestoneId)
  let worktreesRemoved = 0

  if (opts.force) {
    for (const lane of lanes) {
      deps.removeWorktree(lane.branch)
      worktreesRemoved++
    }

    // Remove the ms worktree too
    if (fleet.worktreePath) {
      try {
        deps.removeWorktree(fleet.branch)
      } catch {
        // ms worktree may already be gone
      }
    }

    // Discard the milestone integration branch
    deps.git(['branch', '-D', fleet.branch], {cwd: opts.cwd})
  }

  deleteLanes(db, opts.projectKey, milestoneId)
  deleteFleet(db, opts.projectKey, milestoneId)
  return {branch: fleet.branch, worktreesRemoved}
}

export interface ResetLaneDeps {
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  createWorktree: (opts: {base: string; branch: string; cwd: string}) => {path: string; workspaceId: string}
  openWorktree: (opts: {branch: string; cwd: string}) => {path: string; workspaceId: string}
  paneExists: (paneId: string) => boolean
  worktreeExists: (path: string) => boolean
}

export interface ResetLaneResult {
  paneCreated: boolean
  worktreeCreated: boolean
}

/**
 * Reset a lane from conflict/uncommitted back to active. Ensures the worktree
 * and pane exist — recreates either if gone. Clears the current task so the
 * daemon's next tick dispatches fresh. Reuses surviving infrastructure
 * (worktree path, pane id) when possible.
 */
export function resetLane(db: Database.Database, lane: LaneRow, fleet: FleetRow, deps: ResetLaneDeps): ResetLaneResult {
  const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: lane.projectKey}

  let {worktreePath} = lane
  let workspaceId = lane.workspaceId ?? ''
  let paneId = lane.paneId ?? ''
  let worktreeCreated = false
  let paneCreated = false

  // Worktree gone? Recreate from the ms branch.
  if (!deps.worktreeExists(worktreePath)) {
    try {
      const wt = deps.createWorktree({base: fleet.branch, branch: lane.branch, cwd: fleet.worktreePath})
      worktreePath = wt.path
      workspaceId = wt.workspaceId
    } catch (error) {
      if (!/already exists/i.test((error as Error).message)) throw error
      const wt = deps.openWorktree({branch: lane.branch, cwd: fleet.worktreePath})
      worktreePath = wt.path
      workspaceId = wt.workspaceId
    }

    worktreeCreated = true
  }

  // Pane dead or missing? Create a new one in the (possibly new) worktree.
  if (!paneId || !deps.paneExists(paneId)) {
    paneId = deps.createPane({cwd: worktreePath, label: `hordr:${lane.epicBeanId}`, workspaceId})
    paneCreated = true
  }

  // Atomic update: worktree + workspace + pane + clears currentTaskBeanId.
  setLaneWorktree(db, loc, worktreePath, workspaceId, paneId)
  updateLaneStatus(db, loc, 'active')

  return {paneCreated, worktreeCreated}
}
