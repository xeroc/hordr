import type Database from 'better-sqlite3'

import {execFileSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

import type {HordrConfig} from '../config/schema.js'

import {getBean, markBeanCompleted} from '../beans/client.js'
import {fetchAncestry, fetchEpics, getDispatchable} from '../dispatch/dispatch.js'
import {handleDone} from '../dispatch/done.js'
import {mergeBranch} from '../dispatch/merge.js'
import {spawnInvocation} from '../dispatch/spawn.js'
import {tick, type TickDeps, type TickDepsFactory} from '../dispatch/tick.js'
import {createTab, paneExists} from '../herdr/pane.js'
import {createWorktree, HerdrError, openWorktree, removeWorktreeByBranch} from '../herdr/worktree.js'
import {logger} from '../logger.js'
import {getGitRunner} from '../runtime.js'
import {addRoute, type DaemonRequest, type DaemonResponse} from './server.js'

/** Default tick interval; override with HORDR_TICK_MS. */
export function tickIntervalMs(): number {
  const raw = Number(process.env.HORDR_TICK_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 5000
}

/** Resolve the main repo root from a worktree path via git rev-parse --git-common-dir. */
function mainRepoFromWorktree(worktreePath: string): string {
  try {
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return path.dirname(gitCommonDir)
  } catch {
    return worktreePath
  }
}

/**
 * Build a per-fleet TickDeps factory from the config. Each call returns deps
 * scoped to the given beansCwd (for beans queries). Herdr operations resolve
 * the main repo from the worktree path at call time — no global mainRepoCwd.
 */
export function createTickDepsFactory(config: HordrConfig): TickDepsFactory {
  return (beansCwd: string): TickDeps => ({
    beanStatus: (id) => getBean(id, {cwd: beansCwd}).status as string | undefined,
    commitBeans(worktreePath) {
      // Resolve the beans data directory from the project's .beans.yml.
      // Falls back to '.beans' if config is missing or unparseable.
      let beansDir = '.beans'
      try {
        const cfgPath = path.join(worktreePath, '.beans.yml')
        if (existsSync(cfgPath)) {
          const raw = parse(readFileSync(cfgPath, 'utf8')) as {beans?: {path?: string}}
          if (raw?.beans?.path) beansDir = raw.beans.path
        }
      } catch {
        // Config unreadable — use default
      }

      getGitRunner()(['add', beansDir], {cwd: worktreePath})
      getGitRunner()(['commit', '-m', 'chore(beans): rollup status changes'], {cwd: worktreePath})
    },
    config,
    createPane: (opts) => createTab({cwd: opts.cwd, label: opts.label, workspaceId: opts.workspaceId}).pane_id,
    createWorktree(opts) {
      const repoCwd = mainRepoFromWorktree(opts.cwd)
      try {
        const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: repoCwd})
        return {path: wt.path, workspaceId: wt.workspace_id}
      } catch (error) {
        if (error instanceof HerdrError && /already exists/i.test(error.message)) {
          try {
            const wt = openWorktree({branch: opts.branch, cwd: repoCwd})
            return {path: wt.path, workspaceId: wt.workspace_id}
          } catch {
            getGitRunner()(['branch', '-D', opts.branch], {cwd: repoCwd})
            const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: repoCwd})
            return {path: wt.path, workspaceId: wt.workspace_id}
          }
        }

        throw error
      }
    },
    epicStatus: (id) => getBean(id, {cwd: beansCwd}).status as string,
    fetchAncestry: (id) => fetchAncestry(id, {cwd: beansCwd}),
    fetchBean: (id) => getBean(id, {cwd: beansCwd}),
    fetchDispatchable: (epicId) => getDispatchable(epicId, {cwd: beansCwd}),
    fetchEpics: (milestoneId) => fetchEpics(milestoneId, {cwd: beansCwd}),
    hasReadyWork: (epicId) => getDispatchable(epicId, {cwd: beansCwd}).length > 0,
    markCompleted(id) {
      markBeanCompleted(id, {cwd: beansCwd})
    },
    mergeBranch: (opts) =>
      mergeBranch({cwd: opts.cwd, source: opts.source, target: opts.target}, {git: getGitRunner()}),
    paneAlive: (paneId) => paneExists(paneId),
    removeWorktree: (branch) => removeWorktreeByBranch(branch, beansCwd),
    spawn: (opts) => spawnInvocation(opts),
    worktreeExists: (p) => existsSync(p),
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
      const msg = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : ''
      logger.error(`tick failed: ${msg}${stack ? `\n${stack}` : ''}`)
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
