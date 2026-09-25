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

import {areAllEpicsCompleted, isMilestoneComplete} from '../dispatch/rollup.js'
import {notify} from '../herdr/pane.js'
import {logger} from '../logger.js'
import {
  deleteFleet,
  deleteLanes,
  ensureProject,
  type FleetRow,
  getFleet,
  getProjectPath,
  type LaneLoc,
  type LaneRow,
  listLanes,
  registerFleet,
  setFleetPane,
  setLaneWorktree,
  updateFleetStatus,
  updateLaneStatus,
} from '../storage/fleets.js'
import {type MergeOutcome, type Vcs} from '../vcs/types.js'

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
  /** Create the ms working copy (worktree / jj workspace); return its path. */
  createWorkspace: (opts: {base: string; cwd: string; name: string}) => {path: string; workspaceId: string}
  fetchBean: (id: string) => BeanRecord
}

export interface CreateFleetResult {
  branch: string
}

/**
 * Bootstrap a fleet for a milestone: validate the bean is a milestone, create
 * the milestone integration branch from the recorded base ref (the branch /
 * bookmark the human stood on at `fleet create`), and register the fleet row.
 * Refuses if an active fleet already exists.
 *
 * Does NOT create lanes/worktrees — `hordr fleet check` does that lazily as
 * epics become unblocked (ADR-0014). The `fleet create` command runs one check
 * pass right after this so lanes spawn immediately (ADR-0015).
 */
export async function createFleet(
  db: Database.Database,
  milestoneId: string,
  opts: {baseRef: string; cwd: string; project: ProjectInfo},
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

  // Create the ms integration workspace in one shot: git — herdr worktree
  // create --branch <milestoneId> --base <baseRef> (the worktree IS on the
  // milestone branch; epic merges land here, the scanner reads from here);
  // jj — a workspace named <milestoneId> on top of the base bookmark.
  // The adapter tolerates re-creation (partial-failure retry) internally.
  const msWs = deps.createWorkspace({base: opts.baseRef, cwd: opts.cwd, name: milestoneId})

  registerFleet(db, {
    baseRef: opts.baseRef,
    branch,
    createdAt: new Date().toISOString(),
    milestoneBeanId: milestoneId,
    projectKey: opts.project.projectKey,
    projectRoot: opts.cwd,
    status: 'active',
    worktreePath: msWs.path,
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
  /** Status of a bean in the ms worktree ('completed', 'todo', …). */
  beanStatus: (id: string) => string | undefined
  /** The milestone's direct children (epics) with their status. */
  fetchEpicStatuses: (id: string) => Array<{id: string; status: string}>
  /**
   * Spawn a merger agent to resolve ms→primary conflicts. Returns the pane
   * ID for liveness tracking. Called only on conflict escalation.
   */
  spawnMerger: (opts: {conflictedFiles: string[]; cwd: string; mainRepoCwd: string}) => string
  /** The VCS adapter (default_vcs) — merge, conflict probes, teardown. */
  vcs: Vcs
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
  opts: {baseRef: string; cwd: string; mainRepoCwd: string; projectKey: string},
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

  // git: the ms→primary merge runs in the MAIN repo (primary is checked out
  // there; checking it out in the ms worktree is refused by git — historically
  // surfaced as a phantom "0 conflicted files" conflict). jj: it runs in the
  // ms workspace — `jj new <primary> @` + bookmark move — no checkout constraint.
  const mergeCwd = deps.vcs.kind === 'jj' ? fleet.worktreePath : opts.mainRepoCwd
  const outcome: MergeOutcome = deps.vcs.mergeHeadIntoRef({
    cwd: mergeCwd,
    message: `merge: ${milestoneId} → ${opts.baseRef}`,
    ref: opts.baseRef,
    source: fleet.branch,
  })

  if (outcome.status === 'aborted') {
    throw new FleetError(`ms→primary merge aborted: ${outcome.message}`)
  }

  if (outcome.status === 'conflict') {
    // Conflict: spawn merger agent. git: the main repo is left on primary
    // with the conflicted merge in progress. jj: the ms workspace head IS
    // the conflicted merge commit.
    const conflictedFiles = deps.vcs.conflictedFiles(mergeCwd)
    const paneId = deps.spawnMerger({
      conflictedFiles,
      cwd: mergeCwd,
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

  // Merge succeeded — tear down.
  finishFleetTeardown(deps.vcs, db, fleet, opts)
  return {branch: fleet.branch, merged: true}
}

/**
 * Post-merge fleet teardown: defensive beans commit, workspace removal, ref
 * deletion, row cleanup. Shared by the immediate-success path (finishFleet)
 * and the post-merger-resolution path (engine tick loop).
 *
 * git: safe `branch -d` (refuses unmerged — catches silent no-op merges), run
 * from mainRepoCwd. jj: the ms bookmark deletion mirrors to the git branch.
 */
export function finishFleetTeardown(vcs: Vcs, db: Database.Database, fleet: FleetRow, opts: {mainRepoCwd: string}): void {
  // Defensive commit: mop up any straggler .beans/ writes before removal
  // (hordr-hmbq). Idempotent.
  if (fleet.worktreePath) {
    vcs.commitPending({cwd: fleet.worktreePath, message: 'chore(beans): rollup status changes'})
    vcs.removeWorkspace({cwd: opts.mainRepoCwd, name: fleet.branch, path: fleet.worktreePath})
  }

  // Ref deletion. The merge already landed; orphaned refs are manual cleanup
  // if this fails (e.g. the worktree still holds the ref).
  try {
    vcs.deleteRef({cwd: opts.mainRepoCwd, name: fleet.branch})
  } catch (error) {
    logger.warn(
      `fleet ${fleet.milestoneBeanId}: ref '${fleet.branch}' not deleted: ${(error as Error).message}. ` +
        `Merge landed in ${opts.mainRepoCwd}; orphaned ref needs manual cleanup.`,
    )
  }

  deleteLanes(db, fleet.projectKey, fleet.milestoneBeanId)
  deleteFleet(db, fleet.projectKey, fleet.milestoneBeanId)

  // Toast: the whole fleet (milestone) just merged up into primary.
  notify({body: 'milestone merged into primary', sound: 'done', title: `${fleet.milestoneBeanId} merged`})
}

export interface AbortFleetDeps {
  /** Discard the milestone integration ref (branch/bookmark), merged or not. */
  discardRef: (opts: {cwd: string; name: string}) => void
  /**
   * Remove a lane's working copy. Tolerant: a no-op if already gone (lane was
   * 'done' / merged). Only called with --force.
   */
  removeWorkspace: (opts: {cwd: string; name: string; path: string}) => void
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
      deps.removeWorkspace({cwd: opts.cwd, name: lane.branch, path: lane.worktreePath})
      worktreesRemoved++
    }

    // Remove the ms workspace too
    if (fleet.worktreePath) {
      try {
        deps.removeWorkspace({cwd: opts.cwd, name: fleet.branch, path: fleet.worktreePath})
      } catch {
        // ms workspace may already be gone
      }
    }

    // Discard the milestone integration ref (branch/bookmark)
    deps.discardRef({cwd: opts.cwd, name: fleet.branch})
  }

  deleteLanes(db, opts.projectKey, milestoneId)
  deleteFleet(db, opts.projectKey, milestoneId)
  return {branch: fleet.branch, worktreesRemoved}
}

export interface ResetLaneDeps {
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  createWorkspace: (opts: {base: string; cwd: string; name: string}) => {path: string; workspaceId: string}
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

  // Worktree gone? Recreate from the ms integration line (adapter handles
  // the already-exists recovery internally).
  if (!deps.worktreeExists(worktreePath)) {
    // NOT fleet.worktreePath — herdr rejects worktree create/open sourced from
    // a linked worktree (linked_worktree_source); start from the main repo.
    const mainRepoCwd = getProjectPath(db, fleet.projectKey) ?? fleet.worktreePath
    const wt = deps.createWorkspace({base: fleet.branch, cwd: mainRepoCwd, name: lane.branch})
    worktreePath = wt.path
    workspaceId = wt.workspaceId
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
