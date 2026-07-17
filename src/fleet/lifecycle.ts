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
import {type GitFn, mergeMilestoneToPrimary} from '../dispatch/merge.js'
import {areAllEpicsCompleted, isMilestoneComplete} from '../dispatch/rollup.js'
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
  setLaneWorktree,
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
  git: GitFn
  /**
   * Remove the milestone worktree by path via `git worktree remove` (no
   * --force). Tolerant of an already-gone worktree. Called only after the
   * milestone + all epics are confirmed completed and the ms→primary merge
   * has landed.
   */
  removeWorktree: (worktreePath: string) => void
}

export interface FinishFleetResult {
  branch: string
  merged: boolean
}

/**
 * Finish a fleet: assert the milestone + all its epics are completed, merge
 * ms/<id> into primary (--no-ff), tear down the milestone worktree, then
 * delete the lane + fleet rows. Refuses if the milestone isn't complete or
 * any epic is still open. On a merge conflict it throws (human must resolve
 * in the milestone branch).
 *
 * Lane worktrees are torn down by the daemon's tick as each epic merges
 * (lane → done); finish tears down the milestone worktree itself + drops the
 * bookkeeping rows.
 */
export function finishFleet(
  db: Database.Database,
  milestoneId: string,
  opts: {cwd: string; primaryBranch: string; projectKey: string},
  deps: FinishFleetDeps,
): FinishFleetResult {
  const fleet = getFleet(db, opts.projectKey, milestoneId)
  if (!fleet) {
    throw new FleetError(`no fleet for ${milestoneId} (project ${opts.projectKey})`)
  }

  if (!isMilestoneComplete(milestoneId, {beanStatus: deps.beanStatus})) {
    throw new FleetError(`milestone ${milestoneId} is not completed — rollup must close it first`)
  }

  if (!areAllEpicsCompleted(milestoneId, {fetchEpicStatuses: deps.fetchEpicStatuses})) {
    throw new FleetError(`not all epics under ${milestoneId} are completed`)
  }

  const result = mergeMilestoneToPrimary(
    {cwd: opts.cwd, milestoneId, primaryBranch: opts.primaryBranch},
    {git: deps.git},
  )
  if (result.conflict) {
    throw new FleetError(`merge of ${milestoneId} into ${opts.primaryBranch} conflicted — resolve manually`)
  }

  // Defensive commit: mop up any straggler .beans/ writes (milestone-level
  // rollup, epic-status edits) so `git worktree remove` (no --force) doesn't
  // refuse on dirty-modified (hordr-hmbq). Idempotent — no-op when clean.
  if (fleet.worktreePath) {
    commitBeanChanges({beansDir: deps.beansDir(fleet.worktreePath), cwd: fleet.worktreePath}, {git: deps.git})
    deps.removeWorktree(fleet.worktreePath)
  }

  deleteLanes(db, opts.projectKey, milestoneId)
  deleteFleet(db, opts.projectKey, milestoneId)
  return {branch: fleet.branch, merged: true}
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
