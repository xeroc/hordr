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
import type Database from 'better-sqlite3'

import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'
import type {LaneRow} from '../storage/fleets.js'
import type {DispatchableBean} from './dispatch.js'
import type {MergeResult} from './merge.js'
import type {EpicInfo} from './scan.js'

import {addLane, listFleets, listLanes, setLaneCurrentTask, updateLaneStatus} from '../storage/fleets.js'
import {advanceLane} from './advance.js'
import {createLaneForEpic} from './lane-create.js'
import {scanForNewLanes} from './scan.js'

export interface TickDeps {
  beanStatus: (taskId: string) => string | undefined
  config: HordrConfig
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  // createLane I/O
  createWorktree: (opts: {base: string; branch: string; cwd: string}) => {path?: string; workspaceId: string}
  epicStatus: (epicId: string) => string
  fetchAncestry: (taskId: string) => Array<{descendantsAllCompleted: boolean; id: string}>
  fetchBean: (id: string) => BeanRecord
  // advanceLane I/O
  fetchDispatchable: (epicId: string) => DispatchableBean[]
  // scan
  fetchEpics: (milestoneId: string) => EpicInfo[]
  hasReadyWork: (epicId: string) => boolean
  markCompleted: (beanId: string) => void
  mergeBranch: (opts: {cwd: string; source: string; target: string}) => MergeResult
  paneAlive: (paneId: string) => boolean
  removeWorktree: (branch: string) => void
  spawn: (harness: string, prompt: string) => void
}

export interface TickResult {
  advanced: number
  lanesCreated: number
}

/** One broker pass. Safe to call repeatedly on an interval. */
export function tick(db: Database.Database, deps: TickDeps): TickResult {
  let lanesCreated = 0
  let advanced = 0

  for (const fleet of listFleets(db, {status: 'active'})) {
    // 1. scan: create lanes for newly-unblocked epics
    const existingLaneEpicIds = new Set(listLanes(db, fleet.projectKey, fleet.milestoneBeanId).map((l) => l.epicBeanId))
    const newLanes = scanForNewLanes(fleet.milestoneBeanId, {
      fetchEpics: deps.fetchEpics,
      hasReadyWork: deps.hasReadyWork,
      laneExists: (epicId) => existingLaneEpicIds.has(epicId),
    })

    for (const epic of newLanes) {
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

    // 2. advance each active lane by one step
    const lanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
    for (const lane of lanes) {
      if (lane.status !== 'active') continue
      advanced += advanceActiveLane(db, fleet, lane, deps)
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
      epicStatus: deps.epicStatus,
      fetchAncestry: deps.fetchAncestry,
      fetchBean: deps.fetchBean,
      fetchDispatchable: deps.fetchDispatchable,
      markCompleted: deps.markCompleted,
      mergeBranch: deps.mergeBranch,
      paneAlive: deps.paneAlive,
      removeWorktree: deps.removeWorktree,
      setLaneCurrentTask: (l, taskId) => setLaneCurrentTask(db, l, taskId),
      spawn: deps.spawn,
      updateLaneStatus: (l, status) => updateLaneStatus(db, l, status),
    },
  )
  return 1
}
