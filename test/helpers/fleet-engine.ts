/**
 * TestFleetEngine — a FleetEngine backed by in-memory mocks.
 *
 * Wraps the pure tick() + advanceLane() functions with mock I/O so tests go
 * through the 2-method FleetEngine interface (scanFleet / advanceLane) instead
 * of building 17-closure deps objects or touching module-level seams.
 *
 * Each instance holds its own canned data + recording arrays — no globals to
 * reset between tests.
 */
import type Database from 'better-sqlite3'

import type {HordrConfig} from '../../src/config/schema.js'
import type {AdvanceLaneDeps} from '../../src/dispatch/advance.js'
import type {DispatchableBean} from '../../src/dispatch/dispatch.js'
import type {FleetEngine} from '../../src/dispatch/engine.js'
import type {EpicInfo} from '../../src/dispatch/scan.js'
import type {TickDeps} from '../../src/dispatch/tick.js'
import type {FleetRow, LaneLoc, LaneRow} from '../../src/storage/fleets.js'

import {advanceLane} from '../../src/dispatch/advance.js'
import {tick} from '../../src/dispatch/tick.js'
import {setLaneCurrentTask, setLanePane, updateLaneStatus} from '../../src/storage/fleets.js'

// --- mock data types ---

export interface MockBean {
  assigned?: string
  body?: string
  status: string
  title?: string
  type?: string
}

export interface MockAncestor {
  descendantsAllCompleted: boolean
  id: string
  status: string
}

export interface MockFleetData {
  /** Ancestor chain returned by fetchAncestry (flat — same for any task). */
  ancestry?: MockAncestor[]
  /** Bean records keyed by ID. */
  beans?: Record<string, MockBean>
  /** Child statuses keyed by parent bean ID (for fleet completion check). */
  childStatuses?: Record<string, Array<{id: string; status: string}>>
  /** Dispatchable tasks keyed by epic ID. */
  dispatchable?: Record<string, DispatchableBean[]>
  /** Epics for the milestone (returned by fetchEpics). */
  epics?: EpicInfo[]
}

export interface MockBehavior {
  /** Default bean status for unknown beans (default 'in-progress'). */
  defaultBeanStatus?: string
  /** Whether git merges produce conflicts (default false). */
  mergeConflict?: boolean
  /** Whether panes are alive (default true). */
  paneAlive?: boolean
  /** Whether worktree paths exist on disk (default true). */
  worktreeExists?: boolean
}

// --- records ---

export interface FleetEngineRecords {
  createdPanes: Array<{cwd: string; label: string; workspaceId: string}>
  createdWorktrees: Array<{base: string; branch: string; cwd: string}>
  /** CWds the internal deps factory was called with (per-fleet + per-lane). */
  factoryCwds: string[]
  gitCommits: string[]
  markedCompleted: string[]
  merge: Array<{cwd: string; source: string; target: string}>
  removedWorktrees: string[]
  spawn: Array<{harness: string; paneId: string; prompt: string}>
}

// --- factory ---

export function createTestFleetEngine(opts: {behavior?: MockBehavior; config: HordrConfig; data?: MockFleetData}): {
  engine: FleetEngine
  records: FleetEngineRecords
} {
  const data = opts.data ?? {}
  const behavior: Required<MockBehavior> = {
    defaultBeanStatus: opts.behavior?.defaultBeanStatus ?? 'in-progress',
    mergeConflict: opts.behavior?.mergeConflict ?? false,
    paneAlive: opts.behavior?.paneAlive ?? true,
    worktreeExists: opts.behavior?.worktreeExists ?? true,
  }

  const records: FleetEngineRecords = {
    createdPanes: [],
    createdWorktrees: [],
    factoryCwds: [],
    gitCommits: [],
    markedCompleted: [],
    merge: [],
    removedWorktrees: [],
    spawn: [],
  }

  let paneSeq = 0
  let wtSeq = 0

  // --- shared mock closures ---

  const beanStatus = (id: string): string | undefined => {
    const bean = data.beans?.[id]
    if (bean) return bean.status
    return behavior.defaultBeanStatus
  }

  const epicStatus = (epicId: string): string => data.beans?.[epicId]?.status ?? 'todo'

  const fetchBean = (id: string) =>
    ({
      assigned: data.beans?.[id]?.assigned ?? 'implementer',
      body: data.beans?.[id]?.body ?? 'b',
      id,
      type: data.beans?.[id]?.type ?? 'task',
    }) as never

  const fetchDispatchable = (epicId: string): DispatchableBean[] => data.dispatchable?.[epicId] ?? []

  const fetchAncestry = (): MockAncestor[] => data.ancestry ?? []

  const markCompleted = (id: string): void => {
    records.markedCompleted.push(id)
    const entry = data.ancestry?.find((a) => a.id === id)
    if (entry) entry.status = 'completed'
    const bean = data.beans?.[id]
    if (bean) bean.status = 'completed'
  }

  const mergeBranch = (mo: {cwd: string; source: string; target: string}) => {
    records.merge.push(mo)
    return {conflict: behavior.mergeConflict}
  }

  const createPane = (co: {cwd: string; label: string; workspaceId: string}): string => {
    records.createdPanes.push(co)
    return `test-pane-${++paneSeq}`
  }

  const createWorktree = (wo: {base: string; branch: string; cwd: string}) => {
    records.createdWorktrees.push(wo)
    return {path: `/wt/test-${++wtSeq}`, workspaceId: `ws-${wtSeq}`}
  }

  const spawnFn = (so: {harness: string; paneId: string; prompt: string}): void => {
    records.spawn.push(so)
  }

  const removeWorktree = (branch: string): void => {
    records.removedWorktrees.push(branch)
  }

  const commitBeans = (worktreePath: string): void => {
    records.gitCommits.push(worktreePath)
  }

  // --- TickDeps (for scanFleet) ---

  const buildTickDeps = (cwd: string): TickDeps => {
    records.factoryCwds.push(cwd)
    return {
      beanStatus,
      commitBeans,
      config: opts.config,
      createPane,
      createWorktree,
      epicStatus,
      fetchAncestry,
      fetchBean,
      fetchChildStatuses: (beanId: string) => data.childStatuses?.[beanId] ?? [],
      fetchDispatchable,
      fetchEpics: () => data.epics ?? [],
      // An epic has ready work if it appears in the dispatchable map (even with
      // an empty list — the key presence signals "scanned and has ready tasks").
      hasReadyWork: (epicId: string) => epicId in (data.dispatchable ?? {}),
      markCompleted,
      mergeBranch,
      paneAlive: () => behavior.paneAlive,
      removeWorktree,
      spawn: spawnFn,
      worktreeExists: () => behavior.worktreeExists,
    }
  }

  // --- AdvanceLaneDeps (for advanceLane) ---

  const buildAdvanceDeps = (db: Database.Database): AdvanceLaneDeps => ({
    beanStatus,
    commitBeans,
    createPane,
    epicStatus,
    fetchAncestry,
    fetchBean,
    fetchDispatchable,
    markCompleted,
    mergeBranch,
    paneAlive: () => behavior.paneAlive,
    removeWorktree,
    setLaneCurrentTask: (loc: LaneLoc, taskId: null | string) => setLaneCurrentTask(db, loc, taskId),
    setLanePane: (loc: LaneLoc, paneId: string) => setLanePane(db, loc, paneId),
    spawn: spawnFn,
    updateLaneStatus: (loc: LaneLoc, status: string) => updateLaneStatus(db, loc, status),
  })

  // --- FleetEngine ---

  const engine: FleetEngine = {
    advanceLane(db: Database.Database, fleet: FleetRow, lane: LaneRow) {
      const result = advanceLane(
        {
          config: opts.config,
          fleet: {
            cwd: fleet.worktreePath,
            milestoneBeanId: fleet.milestoneBeanId,
            msBranch: fleet.branch,
            projectKey: fleet.projectKey,
          },
          lane,
        },
        buildAdvanceDeps(db),
      )
      return {action: result.action, taskId: result.taskId}
    },
    scanFleet(db: Database.Database) {
      return tick(db, (cwd) => buildTickDeps(cwd))
    },
  }

  return {engine, records}
}
