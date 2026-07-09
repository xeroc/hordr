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

import {createMilestoneBranch, type GitFn, milestoneBranchName} from '../dispatch/branch.js'
import {ensureProject, type FleetRow, getFleet, type LaneRow, listLanes, registerFleet} from '../storage/fleets.js'

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
  ensureDaemon: () => Promise<{started: boolean}>
  fetchBean: (id: string) => BeanRecord
  git: GitFn
}

export interface CreateFleetResult {
  branch: string
  daemonStarted: boolean
}

/**
 * Bootstrap a fleet for a milestone: validate the bean is a milestone, create
 * the milestone integration branch from primary, register the fleet row, and
 * ensure the daemon is running. Refuses if an active fleet already exists.
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

  const branch = milestoneBranchName(milestoneId)
  createMilestoneBranch({cwd: opts.cwd, milestoneId, primaryBranch: opts.primaryBranch}, {git: deps.git})

  registerFleet(db, {
    branch,
    createdAt: new Date().toISOString(),
    milestoneBeanId: milestoneId,
    projectKey: opts.project.projectKey,
    status: 'active',
    // ponytail: the fleet has no worktree of its own in the per-epic model;
    // the ms/<id> branch lives in the main repo. Epics own the worktrees.
    worktreePath: opts.cwd,
  })

  const daemon = await deps.ensureDaemon()
  return {branch, daemonStarted: daemon.started}
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
