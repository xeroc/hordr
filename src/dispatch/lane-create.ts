/**
 * Lane bootstrap (ADR-0014).
 *
 * createLaneForEpic: when the tick scanner finds an unblocked epic with no
 * lane, create its worktree (branched FROM the milestone integration branch,
 * so it auto-inherits earlier epics' merged code), create a stable
 * pane, and write the lane row (status=active). Pure: git/herdr/SQLite are
 * injected.
 */
import type {LaneRow} from '../storage/fleets.js'

import {ensureLanePane} from './pane.js'

export interface CreateLaneDeps {
  /** Persist the lane row. */
  addLane: (row: LaneRow) => void
  /** Create a pane/tab in the worktree; return its pane id. */
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  /** Create a worktree branched from `base`; return its path + workspace id. */
  createWorktree: (opts: {base: string; branch: string; cwd: string}) => {path?: string; workspaceId: string}
}

export interface CreateLaneOpts {
  cwd: string
  epic: {id: string}
  fleet: {milestoneBeanId: string; msBranch: string; projectKey: string}
}

export interface CreateLaneResult {
  branch: string
  paneId: string
  worktreePath: string
}

/** The epic worktree branch: same as the epic bean id. */
export function laneBranchName(_msBranch: string, epicId: string): string {
  return epicId
}

/**
 * Bootstrap a lane: worktree (from ms/<id>) → pane → lane row (active).
 * Returns the placement the daemon needs to dispatch into it.
 */
export function createLaneForEpic(opts: CreateLaneOpts, deps: CreateLaneDeps): CreateLaneResult {
  const branch = laneBranchName(opts.fleet.msBranch, opts.epic.id)
  const wt = deps.createWorktree({base: opts.fleet.msBranch, branch, cwd: opts.cwd})
  const worktreePath = wt.path ?? wt.workspaceId

  const {paneId} = ensureLanePane(
    {epicId: opts.epic.id, workspaceId: wt.workspaceId, worktreePath},
    {createPane: deps.createPane},
  )

  deps.addLane({
    branch,
    createdAt: new Date().toISOString(),
    currentTaskBeanId: null,
    epicBeanId: opts.epic.id,
    fleetMilestoneBeanId: opts.fleet.milestoneBeanId,
    paneId,
    projectKey: opts.fleet.projectKey,
    status: 'active',
    workspaceId: wt.workspaceId,
    worktreePath,
  })

  return {branch, paneId, worktreePath}
}
