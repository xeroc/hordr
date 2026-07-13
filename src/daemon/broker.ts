import type Database from 'better-sqlite3'

import {handleDone} from '../dispatch/done.js'
import {type FleetEngine} from '../dispatch/engine.js'
import {logger} from '../logger.js'
import {addRoute, type DaemonRequest, type DaemonResponse} from './server.js'

/** Default tick interval; override with HORDR_TICK_MS. */
export function tickIntervalMs(): number {
  const raw = Number(process.env.HORDR_TICK_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 5000
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
  engine: FleetEngine
  intervalMs?: number
  tickFn?: (db: Database.Database, engine: FleetEngine) => void
}): BrokerHandle {
  const run = opts.tickFn ?? ((db, engine) => engine.scanFleet(db))
  const intervalMs = opts.intervalMs ?? tickIntervalMs()
  const timer = setInterval(() => {
    try {
      run(opts.db, opts.engine)
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
  engine: FleetEngine
  intervalMs?: number
  tickFn?: (db: Database.Database, engine: FleetEngine) => void
  verifyCompleted: (taskId: string) => boolean
}): BrokerHandle {
  addRoute('POST', '/done', doneRouteHandler(opts.verifyCompleted))
  return startBroker(opts)
}
