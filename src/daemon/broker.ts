/**
 * The daemon broker runtime (ADR-0010, ADR-0012).
 *
 * Wires the pure `tick` to a real interval and registers the /done route.
 * `createTickDeps` composes the existing beans/git/herdr modules into the
 * TickDeps the tick expects; `startBroker` schedules tick on an interval and
 * returns a stop handle; `doneRouteHandler` wires handleDone into the daemon's
 * route registry (the next tick performs the rollup).
 */
import type Database from 'better-sqlite3'

import type {HordrConfig} from '../config/schema.js'

import {getBean, markBeanCompleted} from '../beans/client.js'
import {fetchAncestry, fetchEpics, getDispatchable} from '../dispatch/dispatch.js'
import {handleDone} from '../dispatch/done.js'
import {mergeBranch} from '../dispatch/merge.js'
import {spawnInvocation} from '../dispatch/spawn.js'
import {tick, type TickDeps, type TickDepsFactory} from '../dispatch/tick.js'
import {createTab, paneExists} from '../herdr/pane.js'
import {createWorktree, HerdrError, openWorktree, removeWorktreeByBranch} from '../herdr/worktree.js'
import {getGitRunner} from '../runtime.js'
import {addRoute, type DaemonRequest, type DaemonResponse} from './server.js'

/** Default tick interval; override with HORDR_TICK_MS. */
export function tickIntervalMs(): number {
  const raw = Number(process.env.HORDR_TICK_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 5000
}

/** Build a per-fleet TickDeps factory from the config. Each call returns deps scoped to the given cwd. */
export function createTickDepsFactory(config: HordrConfig): TickDepsFactory {
  return (cwd: string): TickDeps => ({
    beanStatus: (id) => getBean(id, {cwd}).status as string | undefined,
    config,
    createPane: (opts) => createTab({cwd: opts.cwd, label: opts.label, workspaceId: opts.workspaceId}).pane_id,
    createWorktree(opts) {
      try {
        const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: opts.cwd})
        return {path: wt.path, workspaceId: wt.workspace_id}
      } catch (error) {
        // Branch already exists — try opening the existing worktree
        if (error instanceof HerdrError && /already exists/i.test(error.message)) {
          try {
            const wt = openWorktree({branch: opts.branch, cwd: opts.cwd})
            return {path: wt.path, workspaceId: wt.workspace_id}
          } catch {
            // Worktree gone but branch remains — delete orphan and retry
            getGitRunner()(['branch', '-D', opts.branch], {cwd: opts.cwd})
            const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: opts.cwd})
            return {path: wt.path, workspaceId: wt.workspace_id}
          }
        }

        throw error
      }
    },
    epicStatus: (id) => getBean(id, {cwd}).status as string,
    fetchAncestry: (id) => fetchAncestry(id, {cwd}),
    fetchBean: (id) => getBean(id, {cwd}),
    fetchDispatchable: (epicId) => getDispatchable(epicId, {cwd}),
    fetchEpics: (milestoneId) => fetchEpics(milestoneId, {cwd}),
    hasReadyWork: (epicId) => getDispatchable(epicId, {cwd}).length > 0,
    markCompleted(id) {
      markBeanCompleted(id, {cwd})
    },
    mergeBranch: (opts) =>
      mergeBranch({cwd: opts.cwd, source: opts.source, target: opts.target}, {git: getGitRunner()}),
    paneAlive: (paneId) => paneExists(paneId),
    removeWorktree: (branch) => removeWorktreeByBranch(branch, cwd),
    spawn: (opts) => spawnInvocation(opts),
  })
}

export interface BrokerHandle {
  stop(): void
}

/**
 * Schedule tick on an interval against the open DB. Returns a handle to stop
 * the loop (used by signal handlers / tests). `tickFn` is injectable so tests
 * can spy without real I/O.
 */
export function startBroker(opts: {
  db: Database.Database
  depsFactory: TickDepsFactory
  intervalMs?: number
  tickFn?: (db: Database.Database, depsFactory: TickDepsFactory) => void
}): BrokerHandle {
  const run =
    opts.tickFn ??
    ((db, factory) => {
      tick(db, factory)
    })
  const intervalMs = opts.intervalMs ?? tickIntervalMs()
  const timer = setInterval(() => {
    try {
      run(opts.db, opts.depsFactory)
    } catch (error) {
      // ponytail: a tick must not kill the daemon — log and carry on.

      console.error('[hordr] tick failed:', (error as Error).message)
    }
  }, intervalMs)
  return {stop: () => clearInterval(timer)}
}

/** POST /done route: verify the task is completed, return the handler response. */
export function doneRouteHandler(verifyCompleted: (taskId: string) => boolean) {
  return (req: DaemonRequest): DaemonResponse => handleDone(req.body, {verifyCompleted})
}

/**
 * Full daemon wiring: register /done and start the tick loop. Called by the
 * `hordr daemon` command once the DB + config are ready.
 */
export function wireDaemon(opts: {
  db: Database.Database
  depsFactory: TickDepsFactory
  intervalMs?: number
  tickFn?: (db: Database.Database, depsFactory: TickDepsFactory) => void
  verifyCompleted: (taskId: string) => boolean
}): BrokerHandle {
  addRoute('POST', '/done', doneRouteHandler(opts.verifyCompleted))
  return startBroker(opts)
}
