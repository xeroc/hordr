/**
 * FleetEngine — the runtime that drives every active fleet (ADR-0010..0014).
 *
 * Holds the two things that never change per call site: the loaded config
 * (for agent/harness resolution) and mainRepoCwd (for herdr worktree ops).
 * Per-fleet and per-lane cwd is resolved internally from the fleet/lane rows
 * in the DB — the caller never passes cwd.
 *
 * Absorbs the orchestration that previously lived behind TickDeps forwarding:
 * - the broker scan loop (scan for new lanes → advance each active lane, with
 *   missing-worktree recovery and per-lane try/catch)
 * - the per-lane idle/dispatch/heal/rollup/merge state machine
 * - the per-fleet/per-lane I/O wiring (beans queries scoped to the row's
 *   worktree, herdr ops scoped to mainRepoCwd)
 *
 * The leaf modules it composes (dispatch.ts, heal.ts, rollup.ts, merge.ts,
 * spawn.ts, scan.ts, lane-create.ts, loop.ts) stay as-is — the engine calls
 * them directly instead of forwarding through a deps struct.
 */
import type Database from 'better-sqlite3'

import {existsSync} from 'node:fs'

import type {HordrConfig} from '../config/schema.js'
import type {FleetRow, LaneLoc, LaneRow} from '../storage/fleets.js'

import {getBean, markBeanCompleted, resetBeanToTodo} from '../beans/client.js'
import {resolveBeansDir} from '../beans/dir.js'
import {findConfigPath, loadConfig} from '../config/loader.js'
import {finishFleetTeardown} from '../fleet/lifecycle.js'
import {agentActiveInPane, createTab, notify, paneExists} from '../herdr/pane.js'
import {createHerdrWorkspace, openWorktree} from '../herdr/worktree.js'
import {logger} from '../logger.js'
import {
  addLane,
  countActiveLanes,
  deleteLanesByEpic,
  findLaneByTask,
  getFleet,
  getProjectPath,
  listFleets,
  listLanes,
  setLaneCurrentTask,
  setLanePane,
  setLaneWorktree,
  updateFleetStatus,
  updateLaneStatus,
} from '../storage/fleets.js'
import {getVcsOrMock} from '../vcs/resolve.js'
import {pathsOutside, type Vcs} from '../vcs/types.js'
import {type ContinueDeps, continueLane, type ContinueResult} from './continue.js'
import {
  fetchAncestorChain,
  fetchAncestry,
  fetchChildStatuses,
  fetchDependencyStatus,
  fetchEpics,
  getDispatchable,
} from './dispatch.js'
import {checkInvocation} from './heal.js'
import {createLaneForEpic} from './lane-create.js'
import {dispatchNext} from './loop.js'
import {spawnMerger} from './merger.js'
import {ensureLanePane} from './pane-heal.js'
import {rollup} from './rollup.js'
import {scanForNewLanes} from './scan.js'
import {spawnInvocation} from './spawn.js'

export type LaneAction = 'blocked' | 'dispatched' | 'epic-completed' | 'idle' | 'wait'

export interface TickResult {
  advanced: number
  lanesCreated: number
}

export interface AdvanceResult {
  action: LaneAction
  taskId?: string
}

export interface FleetEngine {
  /** Advance one lane by one step. */
  advanceLane(db: Database.Database, fleet: FleetRow, lane: LaneRow): AdvanceResult
  /** Find and claim the next bean in the lane after /done verification (hordr-thjh). */
  continueTask(db: Database.Database, taskId: string): ContinueResult
  /** One broker pass over all active fleets. Safe to call on an interval. */
  scanFleet(db: Database.Database): TickResult
}

// --- internal helpers (not exported) ---

/**
 * Commit pending beans status changes so they survive merges. Idempotent:
 * a no-op when nothing is pending (hordr-hmbq). git: stage the beans dir +
 * commit; jj: commit the snapshotted working-copy contents.
 */
function commitBeans(vcs: Vcs, worktreePath: string): void {
  vcs.commitPending({cwd: worktreePath, message: 'chore(beans): rollup status changes'})
}

/**
 * True if the lane worktree has no uncommitted non-beans changes. On probe
 * failure returns true — the merge step surfaces real breakage, and false
 * positives here would stall a healthy lane forever.
 *
 * Exported so `hordr fleet finish` can reuse the same clean-index verdict for
 * its ms→primary merge guard (one clean-check policy, no second copy).
 */
export function worktreeClean(vcs: Vcs, worktreePath: string): boolean {
  return vcs.isCleanIgnoringBeans(worktreePath)
}

/**
 * List uncommitted paths in a worktree OUTSIDE the beans data dir. Beans-dir
 * churn is ephemeral rollup status (committed by commitBeans before teardown);
 * any other dirty file is uncommitted code that teardown must not destroy.
 * Empty array = clean / safe to remove (hordr-wd46). Probe failure yields a
 * sentinel — a broken worktree is "dirty enough" to block, not crash the tick.
 */
function dirtyNonBeansPaths(vcs: Vcs, worktreePath: string): string[] {
  return pathsOutside(resolveBeansDir(worktreePath), vcs.dirtyPaths(worktreePath))
}

/**
 * Sweep completed-but-unmarked ancestors under an epic. Returns true if any
 * were marked (so the caller can commit + re-check epic status).
 */
function rollupSweep(epicId: string, beansCwd: string): boolean {
  const children = fetchAncestry(epicId, {cwd: beansCwd})
  let didMark = false
  for (const child of children) {
    if (child.status !== 'completed' && child.descendantsAllCompleted) {
      markBeanCompleted(child.id, {cwd: beansCwd})
      didMark = true
      logger.debug(`lane ${epicId}: rollup sweep marked ${child.id}`)
    }
  }

  return didMark
}

/** Walk the task's ancestor chain, marking completed ancestors until none left. */
function rollupAncestors(taskId: string, beansCwd: string): boolean {
  let didMark = false
  for (;;) {
    const marked = rollup(taskId, {
      fetchAncestry: (id) => fetchAncestry(id, {cwd: beansCwd}),
      markCompleted: (id) => markBeanCompleted(id, {cwd: beansCwd}),
    })
    if (marked.length === 0) break
    didMark = true
    logger.debug(`lane ${marked.join(', ')}`)
  }

  return didMark
}

/**
 * If every epic under the milestone has reached terminal status, mark the
 * milestone completed. Per-task rollup stops at the epic level (ADR-0014),
 * so without this sweep the milestone stays 'todo' forever and
 * `hordr fleet finish` throws "milestone not completed". Ports tick.ts:193-205.
 */
function maybeCompleteMilestone(vcs: Vcs, fleet: FleetRow): void {
  if (getBean(fleet.milestoneBeanId, {cwd: fleet.worktreePath}).status === 'completed') return
  const epicStatuses = fetchChildStatuses(fleet.milestoneBeanId, {cwd: fleet.worktreePath})
  const TERMINAL = new Set(['completed', 'scrapped'])
  const allDone = epicStatuses.length > 0 && epicStatuses.every((e) => TERMINAL.has(e.status))
  if (!allDone) return
  logger.info(`fleet ${fleet.milestoneBeanId}: all epics done → marking milestone completed`)
  markBeanCompleted(fleet.milestoneBeanId, {cwd: fleet.worktreePath})
  commitBeans(vcs, fleet.worktreePath)
}

/**
 * Cross-epic blocker refresh (hordr-lcsi). An idle lane can be starved by
 * stale `.beans/` state: a `--blocked-by` task in another epic completed
 * and merged into `ms/<id>`, but this lane's worktree never pulled that
 * merge in. Detection: a task is ready from the milestone worktree's beans
 * but not from this lane's. If so, fast-forward merge `ms/<id>` into the
 * lane and let the caller re-read dispatchable.
 *
 * Precondition guard: only runs the merge when `getDispatchable(epic, ms)`
 * returns non-empty — i.e. there IS upstream-ready work. No merge ever
 * fires just because the lane happens to be idle.
 *
 * The merge itself goes through the shared {@link attemptMerge} (the single
 * 3-tier strategy), so it inherits the clean-index guard and conflict
 * contract — no second merge implementation here.
 *
 * Returns:
 *   'refreshed'   — merge succeeded; caller must re-read dispatchable
 *   'still-empty' — merge succeeded but the lane sees no work (rare; role/schema mismatch)
 *   'diverged'    — ff-only refused (lane has diverged from ms); needs human
 *   'conflict'    — merge left conflicts in-progress; caller spawns merger
 *   'aborted'     — dirty worktree or checkout failure; merge skipped, retry next pass
 *   'no-work'     — nothing ready upstream either; lane is genuinely idle
 */
function refreshLaneIfStale(
  vcs: Vcs,
  fleet: FleetRow,
  lane: LaneRow,
): 'aborted' | 'conflict' | 'diverged' | 'no-work' | 'refreshed' | 'still-empty' {
  const msReady = getDispatchable(lane.epicBeanId, {cwd: fleet.worktreePath})
  if (msReady.length === 0) return 'no-work'

  logger.info(`lane ${lane.epicBeanId}: ${msReady.length} task(s) ready in ms but not here → merging ${fleet.branch}`)

  // git: the lane worktree is already on lane.branch, so the 3-tier checkout
  // is a no-op and the clean-index guard refuses a dirty lane. jj: `jj new @
  // <ms>@` in the lane workspace (merge commits into the lane stack); no
  // guard needed — the snapshot keeps uncommitted work recoverable by
  // construction.
  const outcome = vcs.integrateHead({
    cwd: lane.worktreePath,
    message: `merge: ${fleet.branch} → ${lane.branch} (cross-epic refresh)`,
    source: fleet.branch,
    target: lane.branch,
  })

  if (outcome.status === 'aborted') {
    logger.warn(`lane ${lane.epicBeanId}: refresh merge aborted — ${outcome.message}`)
    return 'aborted'
  }

  if (outcome.status === 'conflict') {
    return 'conflict'
  }

  commitBeans(vcs, lane.worktreePath)

  const refreshed = getDispatchable(lane.epicBeanId, {cwd: lane.worktreePath})
  if (refreshed.length === 0) {
    logger.warn(
      `lane ${lane.epicBeanId}: merge succeeded but no tasks became dispatchable — ` +
        `possible role resolution issue or schema mismatch`,
    )
    return 'still-empty'
  }

  logger.info(`lane ${lane.epicBeanId}: refresh brought ${refreshed.length} task(s) into readiness`)
  return 'refreshed'
}

// --- factory ---

/**
 * Post-merge lane teardown: dirty check, beans commit, worktree removal,
 * branch deletion, lane → done. Shared by the direct-merge success path
 * and the post-merger-resolution path.
 */
function finishLaneTeardown(
  vcs: Vcs,
  db: Database.Database,
  fleet: FleetRow,
  lane: LaneRow,
  taskId?: string,
): AdvanceResult {
  const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}

  // Defense-in-depth: refuse to tear down a worktree with uncommitted non-beans
  // changes (hordr-wd46). Beans-dir-only dirt is tolerated (ephemeral rollup
  // status, committed by commitBeans above). Keep the worktree so work is
  // recoverable; lane → uncommitted for a human.
  const dirty = dirtyNonBeansPaths(vcs, lane.worktreePath)
  if (dirty.length > 0) {
    logger.error(
      `lane ${lane.epicBeanId}: refusing to remove worktree — uncommitted changes: ${dirty.join(', ')}. ` +
        `Lane → uncommitted. Recover the work, then run 'hordr fleet reset'.`,
    )
    setLaneCurrentTask(db, loc, null)
    updateLaneStatus(db, loc, 'uncommitted')
    return {action: 'blocked', taskId}
  }

  logger.info(`lane ${lane.epicBeanId}: epic completed → merge landed in ${fleet.branch}, cleaning up`)

  // Defensive commit: mop up any straggler .beans/ writes (agent's own `beans
  // update`, or rollup dirt from a tick whose commit was skipped/failed) so
  // `git worktree remove` (no --force) doesn't refuse on dirty-modified
  // (hordr-hmbq). Idempotent — a no-op when the worktree is already clean.
  // Real git errors propagate → lane stalls, worktree preserved (recoverable).
  commitBeans(vcs, lane.worktreePath)

  // Safety contract at the point of no return: the caller (advanceLane) only
  // enters mergeEpicLane when epicStat === 'completed' (re-read from inside
  // the worktree's beans), and the dirty-non-beans check above refused any
  // uncommitted code. Both gates are satisfied here, so a plain teardown (no
  // --force) is safe — the adapter's own dirty refusal is the final net
  // (hordr-wd46).
  //
  // git: `git worktree remove` + safe `branch -d` (refuses unmerged — catches
  // silent no-op merges). jj: `jj workspace forget` + delete the directory +
  // close the herdr workspace; no branch to delete (workspace identity is
  // total). Failures are logged, not fatal — the merge already landed.
  try {
    vcs.removeWorkspace({
      cwd: fleet.worktreePath,
      name: lane.branch,
      path: lane.worktreePath,
      workspaceId: lane.workspaceId ?? undefined,
    })
  } catch (error) {
    logger.warn(`lane ${lane.epicBeanId}: worktree removal failed: ${(error as Error).message}`)
  }

  if (vcs.kind === 'git') {
    try {
      vcs.deleteRef({cwd: fleet.worktreePath, name: lane.branch})
    } catch (error) {
      logger.warn(
        `lane ${lane.epicBeanId}: branch '${lane.branch}' not deleted: ${(error as Error).message}. ` +
          `Merge landed in ${fleet.branch}; orphaned ref needs manual cleanup.`,
      )
    }
  }

  // Toast: this lane's worktree (epic) just merged up into the milestone.
  notify({
    body: `epic merged into ${fleet.milestoneBeanId} (${fleet.branch})`,
    sound: 'done',
    title: `${lane.epicBeanId} merged`,
  })

  setLaneCurrentTask(db, loc, null)
  updateLaneStatus(db, loc, 'done')
  return {action: 'epic-completed', taskId}
}

/**
 * Merge an epic's lane into the ms branch using the 3-tier strategy:
 * 1. ff-only  2. no-ff merge commit  3. spawn merger agent on conflict.
 * On success: tears down the lane. On conflict: spawns merger, lane → 'merging'.
 */
function mergeEpicLane(
  vcs: Vcs,
  db: Database.Database,
  fleet: FleetRow,
  lane: LaneRow,
  config: HordrConfig,
  taskId?: string,
): AdvanceResult {
  const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}
  logger.debug(`lane ${lane.epicBeanId}: merging ${lane.branch} → ${fleet.branch} (cwd=${fleet.worktreePath})`)

  // git: 3-tier (ff-only → no-ff → leave in-progress). jj: `jj new @ <lane>@`
  // in the ms workspace — a conflicted merge is a conflicted head commit, so
  // the merger agent works on a stable tree.
  const outcome = vcs.integrateHead({
    cwd: fleet.worktreePath,
    message: `merge: ${lane.epicBeanId} → ${fleet.branch}`,
    source: lane.branch,
    target: fleet.branch,
  })

  if (outcome.status === 'conflict') {
    // Conflict: spawn merger agent. git: the worktree is left on the target
    // branch with the conflicted merge in progress. jj: the ms workspace head
    // IS the conflicted merge commit.
    const conflictedFiles = vcs.conflictedFiles(fleet.worktreePath)
    const mainRepoCwd = getProjectPath(db, fleet.projectKey) ?? fleet.worktreePath
    const paneId = spawnMerger({
      config,
      ctx: {conflictedFiles, sourceBranch: lane.branch, targetBranch: fleet.branch},
      cwd: fleet.worktreePath,
      mainRepoCwd,
    })
    setLanePane(db, loc, paneId)
    updateLaneStatus(db, loc, 'merging')
    logger.info(
      `lane ${lane.epicBeanId}: merge conflict — spawned merger agent (pane=${paneId}, ` +
        `${conflictedFiles.length} conflicted file(s))`,
    )
    return {action: 'blocked', taskId}
  }

  if (outcome.status === 'aborted') {
    // Pre-merge failure (e.g. checkout refused) — not a conflict. Log and leave
    // the lane for retry; never fall through to teardown (the merge didn't land).
    logger.error(`lane ${lane.epicBeanId}: merge aborted — ${outcome.message}`)
    return {action: 'blocked', taskId}
  }

  // Merge succeeded — teardown the lane.
  return finishLaneTeardown(vcs, db, fleet, lane, taskId)
}

/** Pane-heal reattach: git reopens the herdr worktree; jj adopts the dir. */
function reattachLaneWorkspace(
  vcs: Vcs,
  lane: {branch: string; worktreePath: string},
  mainRepoCwd: string,
): {workspaceId: string} {
  if (vcs.kind === 'jj') return createHerdrWorkspace({cwd: lane.worktreePath, label: `hordr:${lane.branch}`})
  return {workspaceId: openWorktree({branch: lane.branch, cwd: mainRepoCwd}).workspace_id}
}

export function createFleetEngine(config: HordrConfig, opts?: {maxLanes?: number}): FleetEngine {
  // Global concurrency ceiling: at most this many agent invocations may be
  // in flight across every project/fleet at once. Idle lanes defer dispatch
  // (stay idle, retry next pass) once the cap is reached. Default 5.
  const maxLanes = opts?.maxLanes ?? 5
  /**
   * Per-fleet config (hordr-c6ry): resolve .beans.yml from the fleet's own
   * project root (fleet.projectRoot, else the projects-table beans_path) so
   * default_vcs — and with it the adapter + vcs-specific agent personas —
   * match the project, NOT the cwd `fleet check`/`done` was invoked from.
   * Falls back to the invocation config when no config is found or it fails
   * to parse (one broken project must not stall every other fleet).
   */
  const fleetConfigCache = new Map<string, HordrConfig>()
  const fleetConfigFor = (db: Database.Database, fleet: FleetRow): HordrConfig => {
    const start = fleet.projectRoot || getProjectPath(db, fleet.projectKey)
    if (!start) return config
    const configPath = findConfigPath(start)
    if (!configPath) return config
    const hit = fleetConfigCache.get(configPath)
    if (hit) return hit
    try {
      const resolved = loadConfig(configPath)
      fleetConfigCache.set(configPath, resolved)
      logger.debug(`fleet ${fleet.milestoneBeanId}: default_vcs=${resolved.default_vcs} (${configPath})`)
      return resolved
    } catch (error) {
      logger.warn(
        `fleet ${fleet.milestoneBeanId}: config ${configPath} unreadable (${(error as Error).message}) — using invocation config`,
      )
      return config
    }
  }


  const advanceLane = (db: Database.Database, fleet: FleetRow, lane: LaneRow): AdvanceResult => {
    // Per-fleet config + adapter (hordr-c6ry) — shadows the engine-wide pair
    // so every vcs call and spawned persona below matches this fleet's project.
    const config = fleetConfigFor(db, fleet)
    const vcs = getVcsOrMock(config)
    const beansCwd = lane.worktreePath
    const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}

    // --- idle: dispatch the next task, or merge if epic is done ---
    if (!lane.currentTaskBeanId) {
      let dispatchable = getDispatchable(lane.epicBeanId, {cwd: beansCwd})
      if (dispatchable.length === 0) {
        let epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
        logger.debug(`lane, no dispatchable, epic status=${epicStat}`)

        if (epicStat !== 'completed') {
          rollupSweep(lane.epicBeanId, beansCwd)
          commitBeans(vcs, lane.worktreePath)
          epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
          logger.debug(`lane ${lane.epicBeanId}: post-sweep epic status=${epicStat}`)
        }

        if (epicStat === 'completed') {
          logger.info(`lane ${lane.epicBeanId}: epic completed → merge ${lane.branch} into ${fleet.branch}`)
          return mergeEpicLane(vcs, db, fleet, lane, config)
        }

        // Cross-epic blocker refresh (hordr-lcsi): the lane is idle but its
        // epic isn't done. Are tasks ready in the milestone worktree that
        // aren't ready here? If so, ms advanced past us (likely a cross-epic
        // --blocked-by dependency just completed and merged). Pull ms in via
        // fast-forward and re-check. Precondition is the staleness check
        // itself — only merge when there IS upstream-ready work.
        const refreshed = refreshLaneIfStale(vcs, fleet, lane)
        if (refreshed === 'no-work') {
          return {action: 'idle'}
        }

        if (refreshed === 'aborted') {
          // Dirty worktree or checkout failure — merge skipped. Leave the lane
          // active so the next pass retries once the worktree is clean.
          return {action: 'idle'}
        }

        if (refreshed === 'conflict') {
          // Tier 3: ms→lane merge conflicted — spawn merger in lane worktree.
          const conflictedFiles = vcs.conflictedFiles(lane.worktreePath)
          const mainRepoCwd = getProjectPath(db, fleet.projectKey) ?? fleet.worktreePath
          const paneId = spawnMerger({
            config,
            ctx: {conflictedFiles, sourceBranch: fleet.branch, targetBranch: lane.branch},
            cwd: lane.worktreePath,
            mainRepoCwd,
          })
          setLanePane(db, loc, paneId)
          updateLaneStatus(db, loc, 'merging')
          logger.info(`lane ${lane.epicBeanId}: ms→lane merge conflict — spawned merger agent (pane=${paneId})`)
          return {action: 'blocked'}
        }

        if (refreshed === 'still-empty') {
          return {action: 'idle'}
        }

        // 'refreshed' → re-read dispatchable from the now-up-to-date worktree.
        dispatchable = getDispatchable(lane.epicBeanId, {cwd: beansCwd})
        if (dispatchable.length === 0) return {action: 'idle'}
      }

      // Global concurrency cap (hordr fleet check --max-lanes): an idle lane
      // only spawns a new agent while fewer than maxLanes invocations are in
      // flight across every project/fleet. At capacity, defer — stay idle and
      // retry on the next pass. Counted here, before any pane/worktree I/O.
      if (countActiveLanes(db) >= maxLanes) {
        logger.debug(`lane ${lane.epicBeanId}: ${maxLanes} active lane(s) (cap reached) — deferring dispatch`)
        return {action: 'idle'}
      }

      // Pane might be gone (agent closed it, crash) or the whole workspace died
      // (herdr restart, tmux closed). Recreate / reattach as needed (hordr-4722).
      const mainRepoCwd = getProjectPath(db, fleet.projectKey)!
      const pane = ensureLanePane(
        {
          branch: lane.branch,
          epicBeanId: lane.epicBeanId,
          paneId: lane.paneId,
          workspaceId: lane.workspaceId,
          worktreePath: lane.worktreePath,
        },
        mainRepoCwd,
        {createTab, paneExists, reattach: (l, cwd) => reattachLaneWorkspace(vcs, l, cwd)},
      )
      if (pane.healed) {
        // Workspace was reopened — persist the new workspace id + pane atomically.
        setLaneWorktree(db, loc, lane.worktreePath, pane.workspaceId!, pane.paneId)
      } else {
        setLanePane(db, loc, pane.paneId)
      }

      logger.info(`lane ${pane.paneId}`)

      const outcome = dispatchNext(
        {epicId: lane.epicBeanId, paneId: pane.paneId, worktreePath: lane.worktreePath},
        config,
        {
          fetchAncestorChain: (id) => fetchAncestorChain(id, {cwd: beansCwd}),
          fetchBean: (id) => getBean(id, {cwd: beansCwd}),
          fetchDependencyStatus: (id) => fetchDependencyStatus(id, {cwd: beansCwd}),
          fetchDispatchable: () => dispatchable,
          spawn: (harness, prompt) => spawnInvocation({harness, paneId: pane.paneId, prompt}),
        },
      )
      if (!outcome.dispatched) return {action: 'idle'}

      setLaneCurrentTask(db, loc, outcome.beanId)
      logger.info(`lane ${outcome.beanId} (role=${outcome.role})`)
      return {action: 'dispatched', taskId: outcome.beanId}
    }

    // --- active: heal the in-flight invocation ---
    const heal = checkInvocation(
      {paneId: lane.paneId ?? '', taskId: lane.currentTaskBeanId, worktreePath: lane.worktreePath},
      {
        beanStatus: (id) => getBean(id, {cwd: beansCwd}).status as string | undefined,
        paneAlive: (p) => agentActiveInPane(p),
        worktreeClean: (p) => worktreeClean(vcs, p),
      },
    )

    if (heal.action === 'wait') return {action: 'wait'}
    if (heal.action === 'blocked') {
      const crashedTaskId = lane.currentTaskBeanId!
      logger.info(
        `lane ${lane.epicBeanId}: agent gone (task ${crashedTaskId} still in-progress) — ` +
          `resetting bean to todo, re-dispatching next tick`,
      )
      resetBeanToTodo(crashedTaskId, {cwd: beansCwd})
      commitBeans(vcs, lane.worktreePath)
      setLaneCurrentTask(db, loc, null)
      return {action: 'blocked', taskId: crashedTaskId}
    }

    // proceed: bean completed → roll up the ancestry.
    logger.info(`lane ${lane.currentTaskBeanId} completed → rolling up`)
    const taskId = lane.currentTaskBeanId
    rollupAncestors(taskId, beansCwd)
    // Always commit. commitBeanChanges is idempotent (skips when nothing
    // staged), so this mops up the agent's own `beans update` writes even
    // when rollup had no new ancestors to mark — and survives a previous
    // tick whose commit failed. Without this, straggler .beans/ dirt blocks
    // `git worktree remove` at epic completion (hordr-hmbq).
    commitBeans(vcs, lane.worktreePath)

    // did the epic complete? → merge lane into ms/<id>, tear down, go done
    const epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
    logger.debug(`lane epic status=${epicStat}`)
    if (epicStat === 'completed') {
      return mergeEpicLane(vcs, db, fleet, lane, config, taskId)
    }

    // task done, epic still has work.
    // If the agent is still active, it will call /done which handles
    // continuation (hordr-thjh). Don't free the lane — /done owns it.
    if (lane.paneId && agentActiveInPane(lane.paneId)) {
      return {action: 'wait', taskId}
    }

    // pane gone → crash recovery: free lane so next tick dispatches via spawn.
    setLaneCurrentTask(db, loc, null)
    return {action: 'wait', taskId}
  }

  /** One broker pass over all active + merging fleets. */
  const scanFleet = (db: Database.Database): TickResult => {
    let lanesCreated = 0
    let advanced = 0

    const fleets = [...listFleets(db, {status: 'active'}), ...listFleets(db, {status: 'merging'})]
    for (const fleet of fleets) {
      const mainRepoCwd = getProjectPath(db, fleet.projectKey)
      if (!mainRepoCwd) {
        logger.warn(`fleet ${fleet.milestoneBeanId}: project ${fleet.projectKey} not in projects table — skipping`)
        continue
      }

      // Per-fleet config + adapter (hordr-c6ry) — shadows the engine-wide
      // pair for everything this fleet's pass does below.
      const config = fleetConfigFor(db, fleet)
      const vcs = getVcsOrMock(config)

      // Fleet is merging — a merger agent is resolving ms→primary conflicts
      // in the milestone worktree. Check if it's done (pane dead + merge
      // committed). Mirrors the lane 'merging' pattern (engine.ts ~660).
      if (fleet.status === 'merging') {
        if (!existsSync(fleet.worktreePath)) {
          logger.warn(
            `fleet ${fleet.milestoneBeanId}: worktree gone during merge (${fleet.worktreePath}) → marking broken`,
          )
          updateFleetStatus(db, fleet.projectKey, fleet.milestoneBeanId, 'broken')
          continue
        }

        if (fleet.paneId && agentActiveInPane(fleet.paneId)) {
          logger.debug(`fleet ${fleet.milestoneBeanId}: merger agent still running (pane=${fleet.paneId})`)
          continue
        }

        // Pane dead — check integration state.
        if (vcs.isIntegrationSettled({cwd: fleet.worktreePath, source: fleet.branch, target: fleet.branch})) {
          logger.info(`fleet ${fleet.milestoneBeanId}: merger resolved ms→primary conflicts — finishing`)
          vcs.finalizeIntegration({cwd: fleet.worktreePath, target: config.primary_branch})
          finishFleetTeardown(vcs, db, fleet, {mainRepoCwd})
          advanced++
        } else {
          logger.error(`fleet ${fleet.milestoneBeanId}: merger exited but merge not resolved — needs human`)
          updateFleetStatus(db, fleet.projectKey, fleet.milestoneBeanId, 'conflict')
        }

        continue
      }

      // Quarantine (hordr-zqwo): if the fleet's milestone worktree is gone
      // (finish/abort hand-off, manual cleanup, crash), every beans call scoped
      // to it throws — and since fetchEpics below runs outside the per-lane
      // try/catch, that throw aborts the whole tick and stalls every other
      // healthy fleet sharing this daemon. Mark the fleet 'broken' so
      // listFleets({status: 'active'}) skips it on future ticks, and move on.
      if (!existsSync(fleet.worktreePath)) {
        logger.warn(
          `fleet ${fleet.milestoneBeanId}: milestone worktree gone (${fleet.worktreePath}) → marking broken. ` +
            `Recover with 'hordr fleet create ${fleet.milestoneBeanId}' (reuses/restores the worktree) ` +
            `or tear down with 'hordr fleet abort ${fleet.milestoneBeanId}'.`,
        )
        updateFleetStatus(db, fleet.projectKey, fleet.milestoneBeanId, 'broken')
        continue
      }

      // 1. scan: create lanes for newly-unblocked epics
      const allLanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
      const existingLaneEpicIds = new Set(allLanes.map((l) => l.epicBeanId))
      const allEpics = fetchEpics(fleet.milestoneBeanId, {cwd: fleet.worktreePath})
      logger.debug(
        `fleet ${fleet.milestoneBeanId}: ${allEpics.length} epics, ${existingLaneEpicIds.size} lanes (wt=${fleet.worktreePath})`,
      )

      for (const epic of allEpics) {
        const hasLane = existingLaneEpicIds.has(epic.id)
        const laneInfo = hasLane
          ? (() => {
              const lane = allLanes.find((l) => l.epicBeanId === epic.id)
              return `lane=${lane?.status ?? '?'} task=${lane?.currentTaskBeanId ?? '(idle)'}`
            })()
          : getDispatchable(epic.id, {cwd: fleet.worktreePath}).length > 0
            ? 'ready (no lane yet)'
            : 'not ready'
        logger.debug(`  epic ${epic.id}: ${laneInfo} — ${epic.title}`)
      }

      const newLanes = scanForNewLanes(fleet.milestoneBeanId, {
        fetchEpics: (msId) => fetchEpics(msId, {cwd: fleet.worktreePath}),
        hasReadyWork: (epicId) => getDispatchable(epicId, {cwd: fleet.worktreePath}).length > 0,
        laneExists: (epicId) => existingLaneEpicIds.has(epicId),
      })

      for (const epic of newLanes) {
        logger.info(`creating lane for epic ${epic.id} (${epic.title}) in fleet ${fleet.milestoneBeanId}`)
        createLaneForEpic(
          {
            cwd: fleet.worktreePath,
            epic,
            fleet: {milestoneBeanId: fleet.milestoneBeanId, msBranch: fleet.branch, projectKey: fleet.projectKey},
          },
          {
            addLane: (row) => addLane(db, row),
            createPane: (o) => createTab({cwd: o.cwd, label: o.label, workspaceId: o.workspaceId}).pane_id,
            createWorktree(o) {
              const ws = vcs.createWorkspace({base: o.base, cwd: o.cwd, name: o.branch})
              return {path: ws.path, workspaceId: ws.workspaceId}
            },
          },
        )
        lanesCreated++
      }

      // 2. advance each active lane by one step.
      const lanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
      for (const lane of lanes) {
        if (lane.status === 'done') {
          // Stale-done cleanup (hordr-sq00): a lane can go 'done' while its epic
          // still has tasks that were blocked-by another epic. When the blocker
          // merges, those tasks become ready but the lane would stay done
          // forever. If the epic isn't completed AND has ready work, drop the
          // stale row so scanForNewLanes recreates a fresh lane next pass.
          const epicStat = getBean(lane.epicBeanId, {cwd: fleet.worktreePath}).status
          if (epicStat !== 'completed' && getDispatchable(lane.epicBeanId, {cwd: fleet.worktreePath}).length > 0) {
            logger.info(
              `lane ${lane.epicBeanId}: done but epic is ${epicStat} with ready work → deleting stale lane row`,
            )
            deleteLanesByEpic(db, {
              epicId: lane.epicBeanId,
              milestoneId: fleet.milestoneBeanId,
              projectKey: fleet.projectKey,
            })
          }

          continue
        }

        // Lane is merging — a merger agent is resolving conflicts in the
        // milestone worktree. Check if it's done (pane dead + merge committed).
        if (lane.status === 'merging') {
          const loc: LaneLoc = {
            epicId: lane.epicBeanId,
            milestoneId: fleet.milestoneBeanId,
            projectKey: fleet.projectKey,
          }

          // Merger agent still running?
          if (lane.paneId && agentActiveInPane(lane.paneId)) {
            logger.debug(`lane ${lane.epicBeanId}: merger agent still running (pane=${lane.paneId})`)
            continue
          }

          // Pane dead — check integration state. Two possible directions:
          // 1. epic→ms (mergeEpicLane): the merge lives in the fleet worktree
          // 2. ms→lane (refreshLaneIfStale): the merge lives in the lane worktree
          if (vcs.isIntegrationSettled({cwd: fleet.worktreePath, source: lane.branch, target: fleet.branch})) {
            // Epic→ms merge resolved — restore + teardown lane.
            logger.info(`lane ${lane.epicBeanId}: merger resolved epic→ms conflicts — restoring + tearing down`)
            vcs.finalizeIntegration({cwd: fleet.worktreePath, target: fleet.branch})
            finishLaneTeardown(vcs, db, fleet, lane)
            advanced++
          } else if (vcs.isIntegrationSettled({cwd: lane.worktreePath, source: fleet.branch, target: lane.branch})) {
            // Ms→lane refresh resolved — commit beans, lane back to active.
            logger.info(`lane ${lane.epicBeanId}: merger resolved ms→lane conflicts — resuming`)
            vcs.finalizeIntegration({cwd: lane.worktreePath})
            commitBeans(vcs, lane.worktreePath)
            updateLaneStatus(db, loc, 'active')
          } else {
            // Neither merge resolved — lane → conflict. Worktree stays dirty.
            logger.error(`lane ${lane.epicBeanId}: merger exited but merge not resolved — needs human`)
            updateLaneStatus(db, loc, 'conflict')
          }

          continue
        }

        if (lane.status !== 'active') {
          logger.debug(`lane ${lane.epicBeanId}: status=${lane.status} (skip)`)
          continue
        }

        logger.debug(
          `lane ${lane.epicBeanId}: status=active` +
            ` currentTask=${lane.currentTaskBeanId ?? '(none)'}` +
            ` wt=${lane.worktreePath}` +
            ` branch=${lane.branch}`,
        )

        // Recovery: worktree gone (user deleted, crash) → check epic, mark done or recreate.
        if (!existsSync(lane.worktreePath)) {
          const loc: LaneLoc = {
            epicId: lane.epicBeanId,
            milestoneId: fleet.milestoneBeanId,
            projectKey: fleet.projectKey,
          }
          const epicStat = getBean(lane.epicBeanId, {cwd: fleet.worktreePath}).status

          if (epicStat === 'completed') {
            logger.info(`lane ${lane.epicBeanId}: worktree gone, epic completed → mark done`)
            setLaneCurrentTask(db, loc, null)
            updateLaneStatus(db, loc, 'done')
            continue
          }

          logger.info(`lane ${lane.epicBeanId}: worktree gone, recreating from ${fleet.branch}`)
          try {
            const wt = vcs.createWorkspace({base: fleet.branch, cwd: mainRepoCwd, name: lane.branch})
            const wtPath = wt.path
            const paneId = createTab({
              cwd: wtPath,
              label: `hordr:${lane.epicBeanId}`,
              workspaceId: wt.workspaceId,
            }).pane_id
            setLaneWorktree(db, loc, wtPath, wt.workspaceId, paneId)
            // Reflect the fresh worktree+pane on the in-memory row so the
            // advance below dispatches into it THIS pass. The old daemon could
            // defer to "the next tick"; the daemonless model (ADR-0015) is a
            // single pass, so recreation + dispatch must happen together or the
            // lane stalls until the next manual `hordr fleet check`.
            lane.worktreePath = wtPath
            lane.workspaceId = wt.workspaceId
            lane.paneId = paneId
            logger.info(`lane ${lane.epicBeanId}: worktree recreated at ${wtPath}, pane=${paneId}`)
          } catch (error) {
            logger.warn(`lane ${lane.epicBeanId}: worktree recreation failed: ${(error as Error).message}`)
            continue // can't advance into a missing worktree — retry next pass
          }
          // fall through: advance into the freshly recreated worktree this same pass
        }

        // Normal advance — per-lane try/catch so one bad lane doesn't kill the tick
        try {
          advanceLane(db, fleet, lane)
          advanced++
        } catch (error) {
          logger.warn(`lane ${lane.epicBeanId}: advance failed: ${(error as Error).message}`)
        }
      }

      // 3. Fleet completion (hordr-45f3, ports tick.ts:193-205). Per-task
      // rollup stops at the epic level, so the milestone needs its own sweep.
      maybeCompleteMilestone(vcs, fleet)
    }

    return {advanced, lanesCreated}
  }

  // --- continuation (called by /done after verification passes) ---

  const continueTask = (db: Database.Database, taskId: string): ContinueResult => {
    const lane = findLaneByTask(db, taskId)
    if (!lane) return {next: null, reason: 'no lane owns this task (idempotent)'}

    // Per-fleet config + adapter (hordr-c6ry): continuation dispatches the
    // next task with the project's own personas/commit contract. Falls back
    // to the invocation config when the fleet row is gone.
    const fleet = getFleet(db, lane.projectKey, lane.fleetMilestoneBeanId)
    const cfg = fleet ? fleetConfigFor(db, fleet) : config
    const vcs = getVcsOrMock(cfg)

    const beansCwd = lane.worktreePath
    const deps: ContinueDeps = {
      config: cfg,
      fetchAncestorChain: (id) => fetchAncestorChain(id, {cwd: beansCwd}),
      fetchBean: (id) => getBean(id, {cwd: beansCwd}),
      fetchDependencyStatus: (id) => fetchDependencyStatus(id, {cwd: beansCwd}),
      findLane(id) {
        const l = findLaneByTask(db, id)
        if (!l) return null
        return {
          epicId: l.epicBeanId,
          loc: {epicId: l.epicBeanId, milestoneId: l.fleetMilestoneBeanId, projectKey: l.projectKey},
        }
      },
      getDispatchable: (epicId) => getDispatchable(epicId, {cwd: beansCwd}),
      rollup(id) {
        rollupAncestors(id, beansCwd)
        commitBeans(vcs, lane.worktreePath)
      },
      setCurrentTask: (loc, beanId) => setLaneCurrentTask(db, loc, beanId),
    }
    return continueLane(taskId, deps)
  }

  return {advanceLane, continueTask, scanFleet}
}
