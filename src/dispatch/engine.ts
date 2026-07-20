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

import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'

import type {HordrConfig} from '../config/schema.js'
import type {FleetRow, LaneLoc, LaneRow} from '../storage/fleets.js'

import {getBean, markBeanCompleted, resetBeanToTodo} from '../beans/client.js'
import {resolveBeansDir} from '../beans/dir.js'
import {agentActiveInPane, createTab, paneExists} from '../herdr/pane.js'
import {createWorktree, HerdrError, openWorktree, removeWorktreeByPath} from '../herdr/worktree.js'
import {logger} from '../logger.js'
import {getGitRunner} from '../runtime.js'
import {
  addLane,
  deleteLanesByEpic,
  findLaneByTask,
  getProjectPath,
  listFleets,
  listLanes,
  setLaneCurrentTask,
  setLanePane,
  setLaneWorktree,
  updateFleetStatus,
  updateLaneStatus,
} from '../storage/fleets.js'
import {commitBeanChanges} from './commit-beans.js'
import {type ContinueDeps, continueLane, type ContinueResult} from './continue.js'
import {
  fetchAncestorChain,
  fetchAncestry,
  fetchChildStatuses,
  fetchDependencyStatus,
  fetchEpics,
  getDispatchable,
} from './dispatch.js'
import {checkInvocation, worktreeIsClean} from './heal.js'
import {createLaneForEpic} from './lane-create.js'
import {dispatchNext} from './loop.js'
import {mergeBranch} from './merge.js'
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
 * Stage + commit beans status changes inside a worktree so they survive merges.
 *  Idempotent: a no-op when nothing is staged (hordr-hmbq).
 */
function commitBeans(worktreePath: string): void {
  commitBeanChanges({beansDir: resolveBeansDir(worktreePath), cwd: worktreePath}, {git: getGitRunner()})
}

/**
/**
 * True if the lane worktree has no uncommitted non-beans changes.
 * Runs `git status --porcelain` and applies the beans-dir exclusion policy
 * from {@link worktreeIsClean}. On git failure (broken worktree) returns true
 * — the merge step surfaces real breakage, and false positives here would
 * stall a healthy lane forever.
 */
function worktreeClean(worktreePath: string): boolean {
  const beansDir = resolveBeansDir(worktreePath)
  let porcelain = ''
  try {
    porcelain = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return true
  }

  return worktreeIsClean(porcelain, beansDir)
}

/**
 * List uncommitted paths in a worktree OUTSIDE the beans data dir. Beans-dir
 * churn is ephemeral rollup status (committed by commitBeans before teardown);
 * any other dirty file is uncommitted code that teardown must not destroy.
 * Empty array = clean / safe to remove (hordr-wd46).
 */
function dirtyNonBeansPaths(worktreePath: string): string[] {
  const beansDir = resolveBeansDir(worktreePath)
  let raw = ''
  try {
    // ponytail: direct read-only git call — matches worktree.ts's rev-parse
    // pattern. A broken worktree is "dirty enough" to block, not crash the tick.
    raw = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ['<git status failed>']
  }

  const dirty: string[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    // porcelain v1: "XY path" (2 status chars + space + path)
    const p = line.slice(3).trim().replaceAll(/^"|"$/g, '')
    if (!p.startsWith(beansDir + '/')) dirty.push(p)
  }

  return dirty
}

/**
 * Create a worktree off `base` for `branch`, recovering from the
 * "branch already exists" race by opening or recreating it.
 */
function createWorktreeWithRecovery(opts: {base: string; branch: string; cwd: string}): {
  path?: string
  workspaceId: string
} {
  try {
    const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: opts.cwd})
    return {path: wt.path, workspaceId: wt.workspace_id}
  } catch (error) {
    if (error instanceof HerdrError && /already exists/i.test(error.message)) {
      try {
        const wt = openWorktree({branch: opts.branch, cwd: opts.cwd})
        return {path: wt.path, workspaceId: wt.workspace_id}
      } catch {
        getGitRunner()(['branch', '-D', opts.branch], {cwd: opts.cwd})
        const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: opts.cwd})
        return {path: wt.path, workspaceId: wt.workspace_id}
      }
    }

    throw error
  }
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
function maybeCompleteMilestone(fleet: FleetRow): void {
  if (getBean(fleet.milestoneBeanId, {cwd: fleet.worktreePath}).status === 'completed') return
  const epicStatuses = fetchChildStatuses(fleet.milestoneBeanId, {cwd: fleet.worktreePath})
  const TERMINAL = new Set(['completed', 'scrapped'])
  const allDone = epicStatuses.length > 0 && epicStatuses.every((e) => TERMINAL.has(e.status))
  if (!allDone) return
  logger.info(`fleet ${fleet.milestoneBeanId}: all epics done → marking milestone completed`)
  markBeanCompleted(fleet.milestoneBeanId, {cwd: fleet.worktreePath})
  commitBeans(fleet.worktreePath)
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
 * Returns:
 *   'refreshed'   — ff-merge succeeded; caller must re-read dispatchable
 *   'still-empty' — ff-merge succeeded but the lane sees no work (rare; role/schema mismatch)
 *   'diverged'    — ff-only refused (lane has diverged from ms); needs human
 *   'no-work'     — nothing ready upstream either; lane is genuinely idle
 */
function refreshLaneIfStale(fleet: FleetRow, lane: LaneRow): 'diverged' | 'no-work' | 'refreshed' | 'still-empty' {
  const msReady = getDispatchable(lane.epicBeanId, {cwd: fleet.worktreePath})
  if (msReady.length === 0) return 'no-work'

  logger.info(
    `lane ${lane.epicBeanId}: ${msReady.length} task(s) ready in ms but not here → ff-merging ${fleet.branch}`,
  )
  try {
    getGitRunner()(['merge', '--ff-only', fleet.branch], {cwd: lane.worktreePath})
  } catch (error) {
    logger.warn(
      `lane ${lane.epicBeanId}: ff-merge of ${fleet.branch} refused (lane diverged) — ` +
        `manual merge required to pick up cross-epic unblocks. ${(error as Error).message}`,
    )
    return 'diverged'
  }

  commitBeans(lane.worktreePath)

  const refreshed = getDispatchable(lane.epicBeanId, {cwd: lane.worktreePath})
  if (refreshed.length === 0) {
    logger.warn(
      `lane ${lane.epicBeanId}: ff-merge succeeded but no tasks became dispatchable — ` +
        `possible role resolution issue or schema mismatch`,
    )
    return 'still-empty'
  }

  logger.info(`lane ${lane.epicBeanId}: refresh brought ${refreshed.length} task(s) into readiness`)
  return 'refreshed'
}

// --- factory ---

/** Merge an epic's lane into the ms branch, tear down the worktree, go done. */
function mergeEpicLane(db: Database.Database, fleet: FleetRow, lane: LaneRow, taskId?: string): AdvanceResult {
  const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}
  logger.debug(`lane ${lane.epicBeanId}: merging ${lane.branch} → ${fleet.branch} (cwd=${fleet.worktreePath})`)
  const result = mergeBranch(
    {cwd: fleet.worktreePath, source: lane.branch, target: fleet.branch},
    {git: getGitRunner()},
  )
  if (result.conflict) {
    logger.error(`lane — needs human resolution`)
    updateLaneStatus(db, loc, 'conflict')
    return {action: 'blocked', taskId}
  }

  // Defense-in-depth: refuse to tear down a worktree with uncommitted non-beans
  // changes (hordr-wd46). Beans-dir-only dirt is tolerated (ephemeral rollup
  // status, committed by commitBeans above). Keep the worktree so work is
  // recoverable; lane → uncommitted for a human.
  const dirty = dirtyNonBeansPaths(lane.worktreePath)
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
  commitBeans(lane.worktreePath)

  // Safety contract at the point of no return: the caller (advanceLane) only
  // enters mergeEpicLane when epicStat === 'completed' (re-read from inside
  // the worktree's beans), and the dirty-non-beans check above refused any
  // uncommitted code. Both gates are satisfied here, so a plain
  // `git worktree remove` (no --force) is safe — git's own dirty refusal is
  // the final net (hordr-wd46).
  try {
    removeWorktreeByPath(lane.worktreePath)
  } catch (error) {
    logger.warn(`lane ${lane.epicBeanId}: worktree removal failed: ${(error as Error).message}`)
  }

  // Branch deletion: -d (safe delete, NOT -D). Run from the fleet worktree
  // which is on fleet.branch — the branch the lane was merged into. -d refuses
  // unmerged branches, which catches silent no-op merges. If the worktree
  // still holds the branch (removal failed above), this also fails — logged,
  // not fatal. The merge already landed; orphaned refs are manual cleanup.
  try {
    getGitRunner()(['branch', '-d', lane.branch], {cwd: fleet.worktreePath})
  } catch (error) {
    logger.warn(
      `lane ${lane.epicBeanId}: branch '${lane.branch}' not deleted: ${(error as Error).message}. ` +
        `Merge landed in ${fleet.branch}; orphaned ref needs manual cleanup.`,
    )
  }

  setLaneCurrentTask(db, loc, null)
  updateLaneStatus(db, loc, 'done')
  return {action: 'epic-completed', taskId}
}

export function createFleetEngine(config: HordrConfig): FleetEngine {
  /** Advance one lane by one step: idle/dispatch/heal/rollup/merge. */
  const advanceLane = (db: Database.Database, fleet: FleetRow, lane: LaneRow): AdvanceResult => {
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
          commitBeans(lane.worktreePath)
          epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
          logger.debug(`lane ${lane.epicBeanId}: post-sweep epic status=${epicStat}`)
        }

        if (epicStat === 'completed') {
          logger.info(`lane ${lane.epicBeanId}: epic completed → merge ${lane.branch} into ${fleet.branch}`)
          return mergeEpicLane(db, fleet, lane)
        }

        // Cross-epic blocker refresh (hordr-lcsi): the lane is idle but its
        // epic isn't done. Are tasks ready in the milestone worktree that
        // aren't ready here? If so, ms advanced past us (likely a cross-epic
        // --blocked-by dependency just completed and merged). Pull ms in via
        // fast-forward and re-check. Precondition is the staleness check
        // itself — only merge when there IS upstream-ready work.
        const refreshed = refreshLaneIfStale(fleet, lane)
        if (refreshed === 'no-work') {
          return {action: 'idle'}
        }

        if (refreshed === 'diverged' || refreshed === 'still-empty') {
          return {action: 'idle'}
        }

        // 'refreshed' → re-read dispatchable from the now-up-to-date worktree.
        dispatchable = getDispatchable(lane.epicBeanId, {cwd: beansCwd})
        if (dispatchable.length === 0) return {action: 'idle'}
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
        {createTab, openWorktree, paneExists},
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
        worktreeClean,
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
      commitBeans(lane.worktreePath)
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
    commitBeans(lane.worktreePath)

    // did the epic complete? → merge lane into ms/<id>, tear down, go done
    const epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
    logger.debug(`lane epic status=${epicStat}`)
    if (epicStat === 'completed') {
      return mergeEpicLane(db, fleet, lane, taskId)
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

  /** One broker pass over all active fleets. */
  const scanFleet = (db: Database.Database): TickResult => {
    let lanesCreated = 0
    let advanced = 0

    for (const fleet of listFleets(db, {status: 'active'})) {
      const mainRepoCwd = getProjectPath(db, fleet.projectKey)
      if (!mainRepoCwd) {
        logger.warn(`fleet ${fleet.milestoneBeanId}: project ${fleet.projectKey} not in projects table — skipping`)
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
            createWorktree: (o) => createWorktreeWithRecovery({base: o.base, branch: o.branch, cwd: mainRepoCwd}),
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
            const wt = createWorktreeWithRecovery({base: fleet.branch, branch: lane.branch, cwd: mainRepoCwd})
            const wtPath = wt.path ?? wt.workspaceId
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
      maybeCompleteMilestone(fleet)
    }

    return {advanced, lanesCreated}
  }

  // --- continuation (called by /done after verification passes) ---

  const continueTask = (db: Database.Database, taskId: string): ContinueResult => {
    const lane = findLaneByTask(db, taskId)
    if (!lane) return {next: null, reason: 'no lane owns this task (idempotent)'}

    const beansCwd = lane.worktreePath
    const deps: ContinueDeps = {
      config,
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
        commitBeans(lane.worktreePath)
      },
      setCurrentTask: (loc, beanId) => setLaneCurrentTask(db, loc, beanId),
    }
    return continueLane(taskId, deps)
  }

  return {advanceLane, continueTask, scanFleet}
}
