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

import {type GitFn, mergeMilestoneToPrimary} from '../dispatch/merge.js'
import {areAllEpicsCompleted, isMilestoneComplete} from '../dispatch/rollup.js'
import {
  deleteFleet,
  deleteLanes,
  ensureProject,
  type FleetRow,
  getFleet,
  type LaneRow,
  listLanes,
  registerFleet,
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
  /** Throw if the daemon is not reachable. Never spawns. */
  ensureDaemon: () => Promise<void>
  fetchBean: (id: string) => BeanRecord
  git: GitFn
}

export interface CreateFleetResult {
  branch: string
}

/**
 * Bootstrap a fleet for a milestone: validate the bean is a milestone, create
 * the milestone integration branch from primary, register the fleet row, and
 * require the daemon to already be running (throws if not — never spawns).
 * Refuses if an active fleet already exists.
 *
 * Does NOT create lanes/worktrees — the daemon's tick scanner does that
 * lazily as epics become unblocked (ADR-0014).
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

  // Fail fast: refuse to create worktrees or fleet rows if the daemon isn't
  // listening. Avoids partial state when the operator forgot `hordr daemon`.
  await deps.ensureDaemon()

  const branch = milestoneId

  // Create the ms branch + worktree in one shot: herdr worktree create
  // --branch <milestoneId> --base <primary>. The worktree IS on the milestone
  // branch — epic merges land here, the scanner reads from here.
  const msWt = deps.createWorktree({base: opts.primaryBranch, branch, cwd: opts.cwd})

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
  /** Status of a bean in the worktree ('completed', 'todo', …). */
  beanStatus: (id: string) => string | undefined
  /** The milestone's direct children (epics) with their status. */
  fetchEpicStatuses: (id: string) => Array<{id: string; status: string}>
  git: GitFn
  /**
   * Remove the milestone worktree by its branch. Tolerant of an already-gone
   * worktree (e.g. aborted mid-flight). Wired to removeWorktreeByBranch in the
   * command, which resolves the main repo cwd.
   */
  removeWorktree: (branch: string) => void
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

  deps.removeWorktree(fleet.branch)
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
