import type Database from 'better-sqlite3'

/**
 * The broker tick (ADR-0010, ADR-0012, ADR-0014).
 *
 * One pass over every active fleet: scan for new lanes (create worktrees for
 * newly-unblocked epics), then advance each active lane by one step. Composes
 * scanForNewLanes + createLaneForEpic + advanceLane. The daemon calls this on
 * an interval; the tick is pure against the DB + injected I/O.
 *
 * Lanes not in 'active' status (pending/merging/conflict/done) are skipped —
 * conflict lanes wait for a human, done lanes are finished.
 */
import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'
import type {LaneRow} from '../storage/fleets.js'
import type {DispatchableBean} from './dispatch.js'
import type {MergeResult} from './merge.js'
import type {EpicInfo} from './scan.js'

import {logger} from '../logger.js'
import {
  addLane,
  deleteLanesByEpic,
  listFleets,
  listLanes,
  setLaneCurrentTask,
  setLanePane,
  setLaneWorktree,
  updateLaneStatus,
} from '../storage/fleets.js'
import {advanceLane} from './advance.js'
import {createLaneForEpic} from './lane-create.js'
import {scanForNewLanes} from './scan.js'

export interface TickDeps {
  beanStatus: (taskId: string) => string | undefined
  commitBeans: (worktreePath: string) => void
  config: HordrConfig
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  // createLane I/O
  createWorktree: (opts: {base: string; branch: string; cwd: string}) => {path?: string; workspaceId: string}
  epicStatus: (epicId: string) => string
  fetchAncestry: (taskId: string) => Array<{descendantsAllCompleted: boolean; id: string; status: string}>
  fetchBean: (id: string) => BeanRecord
  // advanceLane I/O
  fetchChildStatuses: (beanId: string) => Array<{id: string; status: string}>
  fetchDispatchable: (epicId: string) => DispatchableBean[]
  // scan
  fetchEpics: (milestoneId: string) => EpicInfo[]
  hasReadyWork: (epicId: string) => boolean
  markCompleted: (beanId: string) => void
  mergeBranch: (opts: {cwd: string; source: string; target: string}) => MergeResult
  paneAlive: (paneId: string) => boolean
  removeWorktree: (branch: string) => void
  spawn: (opts: {harness: string; paneId: string; prompt: string}) => void
  worktreeExists: (path: string) => boolean
}

export type TickDepsFactory = (cwd: string) => TickDeps

export interface TickResult {
  advanced: number
  lanesCreated: number
}

/** One broker pass. Safe to call repeatedly on an interval. */
export function tick(db: Database.Database, depsFactory: TickDepsFactory): TickResult {
  let lanesCreated = 0
  let advanced = 0

  for (const fleet of listFleets(db, {status: 'active'})) {
    // Per-fleet deps: beans queries scoped to the fleet's project directory.
    const deps = depsFactory(fleet.worktreePath)

    // 1. scan: create lanes for newly-unblocked epics
    const allLanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
    const existingLaneEpicIds = new Set(allLanes.map((l) => l.epicBeanId))
    const allEpics = deps.fetchEpics(fleet.milestoneBeanId)
    logger.debug(
      `fleet ${fleet.milestoneBeanId}: ${allEpics.length} epics, ${existingLaneEpicIds.size} lanes (wt=${fleet.worktreePath})`,
    )

    for (const epic of allEpics) {
      const hasLane = existingLaneEpicIds.has(epic.id)
      const ready = hasLane ? '(has lane)' : deps.hasReadyWork(epic.id) ? 'ready' : 'not ready'
      logger.debug(`  epic ${epic.id}: ${ready} — ${epic.title}`)
    }

    const newLanes = scanForNewLanes(fleet.milestoneBeanId, {
      fetchEpics: deps.fetchEpics,
      hasReadyWork: deps.hasReadyWork,
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
        {addLane: (row) => addLane(db, row), createPane: deps.createPane, createWorktree: deps.createWorktree},
      )
      lanesCreated++
    }

    // 2. advance each active lane by one step.
    // Also: clean up stale 'done' lanes whose epic isn't actually completed.
    const lanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
    for (const lane of lanes) {
      if (lane.status === 'done') {
        // Lane is done but is the epic actually completed? If not, and there's
        // ready work, the lane was prematurely closed. Delete the stale row so
        // the scanner recreates a fresh lane on the next tick.
        const epicStat = deps.epicStatus(lane.epicBeanId)
        if (epicStat !== 'completed' && deps.hasReadyWork(lane.epicBeanId)) {
          logger.info(`lane ${lane.epicBeanId}: done but epic is ${epicStat} with ready work → deleting stale lane row`)
          const loc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}
          deleteLanesByEpic(db, loc)
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

      // Recovery: if the worktree is gone (user deleted it, crash, etc.),
      // check the epic status and either mark done or recreate.
      if (!deps.worktreeExists(lane.worktreePath)) {
        const loc = {epicId: lane.epicBeanId, milestoneId: fleet.milestoneBeanId, projectKey: fleet.projectKey}
        const fleetDeps = depsFactory(fleet.worktreePath)
        const epicStat = fleetDeps.epicStatus(lane.epicBeanId)

        if (epicStat === 'completed') {
          logger.info(`lane ${lane.epicBeanId}: worktree gone, epic completed → mark done`)
          setLaneCurrentTask(db, loc, null)
          updateLaneStatus(db, loc, 'done')
          continue
        }

        // Epic not completed — recreate the worktree from the ms branch
        logger.info(`lane ${lane.epicBeanId}: worktree gone, recreating from ${fleet.branch}`)
        try {
          const wt = deps.createWorktree({base: fleet.branch, branch: lane.branch, cwd: fleet.worktreePath})
          const wtPath = wt.path ?? wt.workspaceId
          const paneId = deps.createPane({
            cwd: wtPath,
            label: `hordr:${lane.epicBeanId}`,
            workspaceId: wt.workspaceId,
          })
          setLaneWorktree(db, loc, wtPath, wt.workspaceId, paneId)
          logger.info(`lane ${lane.epicBeanId}: worktree recreated at ${wtPath}, pane=${paneId}`)
        } catch (error) {
          logger.warn(`lane ${lane.epicBeanId}: worktree recreation failed: ${(error as Error).message}`)
        }

        continue // next tick will dispatch into the fresh worktree
      }

      // Normal advance — per-lane try/catch so one bad lane doesn't kill the tick
      try {
        advanced += advanceActiveLane(db, fleet, lane, depsFactory(lane.worktreePath))
      } catch (error) {
        logger.warn(`lane ${lane.epicBeanId}: advance failed: ${(error as Error).message}`)
      }
    }

    // 3. Fleet completion: if all epics are done, mark the milestone completed.
    //    This is the step that makes `hordr fleet finish` work — without it,
    //    the milestone bean stays 'todo' even when every epic is completed.
    if (deps.beanStatus(fleet.milestoneBeanId) !== 'completed') {
      const epicStatuses = deps.fetchChildStatuses(fleet.milestoneBeanId)
      const TERMINAL = new Set(['completed', 'scrapped'])
      const allDone = epicStatuses.length > 0 && epicStatuses.every((e) => TERMINAL.has(e.status))
      if (allDone) {
        logger.info(`fleet ${fleet.milestoneBeanId}: all epics done → marking milestone completed`)
        deps.markCompleted(fleet.milestoneBeanId)
        deps.commitBeans(fleet.worktreePath)
      }
    }
  }

  return {advanced, lanesCreated}
}

/** advanceLane bound to the DB-backed store mutations. Returns 1 if it ran. */
function advanceActiveLane(
  db: Database.Database,
  fleet: {branch: string; milestoneBeanId: string; projectKey: string; worktreePath: string},
  lane: LaneRow,
  deps: TickDeps,
): number {
  advanceLane(
    {
      config: deps.config,
      fleet: {
        cwd: fleet.worktreePath,
        milestoneBeanId: fleet.milestoneBeanId,
        msBranch: fleet.branch,
        projectKey: fleet.projectKey,
      },
      lane,
    },
    {
      beanStatus: deps.beanStatus,
      commitBeans: deps.commitBeans,
      createPane: deps.createPane,
      epicStatus: deps.epicStatus,
      fetchAncestry: deps.fetchAncestry,
      fetchBean: deps.fetchBean,
      fetchDispatchable: deps.fetchDispatchable,
      markCompleted: deps.markCompleted,
      mergeBranch: deps.mergeBranch,
      paneAlive: deps.paneAlive,
      removeWorktree: deps.removeWorktree,
      setLaneCurrentTask: (l, taskId) => setLaneCurrentTask(db, l, taskId),
      setLanePane: (l, paneId) => setLanePane(db, l, paneId),
      spawn: deps.spawn,
      updateLaneStatus: (l, status) => updateLaneStatus(db, l, status),
    },
  )
  return 1
}
