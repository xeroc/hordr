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
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

import type {HordrConfig} from '../config/schema.js'
import type {FleetRow, LaneLoc, LaneRow} from '../storage/fleets.js'

import {getBean, markBeanCompleted} from '../beans/client.js'
import {createTab, paneExists} from '../herdr/pane.js'
import {createWorktree, HerdrError, openWorktree, removeWorktreeByBranch} from '../herdr/worktree.js'
import {logger} from '../logger.js'
import {getGitRunner} from '../runtime.js'
import {
  addLane,
  getProjectPath,
  listFleets,
  listLanes,
  setLaneCurrentTask,
  setLanePane,
  setLaneWorktree,
  updateLaneStatus,
} from '../storage/fleets.js'
import {fetchAncestorChain, fetchAncestry, fetchDependencyStatus, fetchEpics, getDispatchable} from './dispatch.js'
import {checkInvocation, worktreeIsClean} from './heal.js'
import {createLaneForEpic} from './lane-create.js'
import {dispatchNext} from './loop.js'
import {mergeBranch} from './merge.js'
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
  /** One broker pass over all active fleets. Safe to call on an interval. */
  scanFleet(db: Database.Database): TickResult
}

// --- internal helpers (not exported) ---

/** Resolve the beans data directory from a worktree's .beans.yml (default '.beans'). */
function resolveBeansDir(worktreePath: string): string {
  try {
    const cfgPath = path.join(worktreePath, '.beans.yml')
    if (existsSync(cfgPath)) {
      const raw = parse(readFileSync(cfgPath, 'utf8')) as {beans?: {path?: string}}
      if (raw?.beans?.path) return raw.beans.path
    }
  } catch {
    // Config unreadable — use default
  }

  return '.beans'
}

/** Stage + commit beans status changes inside a worktree so they survive merges. */
function commitBeans(worktreePath: string): void {
  const beansDir = resolveBeansDir(worktreePath)
  const git = getGitRunner()
  git(['add', beansDir], {cwd: worktreePath})
  git(['commit', '-m', 'chore(beans): rollup status changes'], {cwd: worktreePath})
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

// --- factory ---

/** Merge an epic's lane into the ms branch, tear down the worktree, go done. */
function mergeEpicLane(db: Database.Database, fleet: FleetRow, lane: LaneRow, taskId?: string): AdvanceResult {
  const loc: LaneLoc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}
  const mainRepoCwd = getProjectPath(db, fleet.projectKey)!
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

  logger.info(`lane, removing worktree, lane → done`)
  removeWorktreeByBranch(lane.branch, mainRepoCwd)
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
      const dispatchable = getDispatchable(lane.epicBeanId, {cwd: beansCwd})
      if (dispatchable.length === 0) {
        let epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
        logger.debug(`lane, no dispatchable, epic status=${epicStat}`)

        if (epicStat !== 'completed' && rollupSweep(lane.epicBeanId, beansCwd)) {
          commitBeans(lane.worktreePath)
          epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
          logger.debug(`lane ${lane.epicBeanId}: post-sweep epic status=${epicStat}`)
        }

        if (epicStat === 'completed') {
          logger.info(`lane ${lane.epicBeanId}: epic completed → merge ${lane.branch} into ${fleet.branch}`)
          return mergeEpicLane(db, fleet, lane)
        }

        return {action: 'idle'}
      }

      // Pane might be gone (agent closed it, crash). Recreate if needed.
      let paneId = lane.paneId ?? ''
      if (!paneId || !paneExists(paneId)) {
        paneId = createTab({
          cwd: lane.worktreePath,
          label: `hordr:${lane.epicBeanId}`,
          workspaceId: lane.workspaceId ?? '',
        }).pane_id
        setLanePane(db, loc, paneId)
        logger.info(`lane ${paneId}`)
      }

      const outcome = dispatchNext({epicId: lane.epicBeanId, paneId, worktreePath: lane.worktreePath}, config, {
        fetchAncestorChain: (id) => fetchAncestorChain(id, {cwd: beansCwd}),
        fetchBean: (id) => getBean(id, {cwd: beansCwd}),
        fetchDependencyStatus: (id) => fetchDependencyStatus(id, {cwd: beansCwd}),
        fetchDispatchable: () => dispatchable,
        spawn: (harness, prompt) => spawnInvocation({harness, paneId, prompt}),
      })
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
        paneAlive: (p) => paneExists(p),
        worktreeClean,
      },
    )

    if (heal.action === 'wait') return {action: 'wait'}
    if (heal.action === 'blocked') {
      logger.warn(
        `lane ${lane.epicBeanId}: CONFLICT — task ${lane.currentTaskBeanId} ${heal.reason}.` +
          ` The agent may have crashed or stopped without calling 'hordr done' or 'hordr blocked'.` +
          ` Lane is now paused. To retry: ensure the task is ready, then run 'hordr fleet reset' or manually set the lane back to active.`,
      )
      updateLaneStatus(db, loc, 'conflict')
      return {action: 'blocked', taskId: lane.currentTaskBeanId}
    }

    // proceed: bean completed → roll up the ancestry.
    logger.info(`lane ${lane.currentTaskBeanId} completed → rolling up`)
    const taskId = lane.currentTaskBeanId
    if (rollupAncestors(taskId, beansCwd)) commitBeans(lane.worktreePath)

    // did the epic complete? → merge lane into ms/<id>, tear down, go done
    const epicStat = getBean(lane.epicBeanId, {cwd: beansCwd}).status
    logger.debug(`lane epic status=${epicStat}`)
    if (epicStat === 'completed') {
      return mergeEpicLane(db, fleet, lane, taskId)
    }

    // task done but epic still has work → free the lane for the next dispatch
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
            logger.info(`lane ${lane.epicBeanId}: worktree recreated at ${wtPath}, pane=${paneId}`)
          } catch (error) {
            logger.warn(`lane ${lane.epicBeanId}: worktree recreation failed: ${(error as Error).message}`)
          }

          continue // next tick dispatches into the fresh worktree
        }

        // Normal advance — per-lane try/catch so one bad lane doesn't kill the tick
        try {
          advanceLane(db, fleet, lane)
          advanced++
        } catch (error) {
          logger.warn(`lane ${lane.epicBeanId}: advance failed: ${(error as Error).message}`)
        }
      }
    }

    return {advanced, lanesCreated}
  }

  return {advanceLane, scanFleet}
}
