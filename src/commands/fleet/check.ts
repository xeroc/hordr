import type Database from 'better-sqlite3'

/**
 * hordr fleet check — the daemonless fleet heartbeat (ADR-0015).
 *
 * One idempotent pass over every active fleet: scan for newly-unblocked epics
 * (create lanes/worktrees), heal crashed agents, merge completed epics, spawn
 * idle lanes, recover gone worktrees, mark milestones completed. This is the
 * same `engine.scanFleet` the old daemon tick ran on a 5s timer — now triggered
 * explicitly (manually or via cron) instead of by a long-running process.
 *
 * Run it: `hordr fleet check`. Cron it every ~5 min (see README for the line).
 *
 * Mutual exclusion: a PID-file lock serializes concurrent runs (cron + manual
 * overlap). If the lock is held, the run skips cleanly.
 */
import {Command, Flags} from '@oclif/core'

import {loadConfig} from '../../config/loader.js'
import {createFleetEngine, type TickResult} from '../../dispatch/engine.js'
import {configureLogger, logger} from '../../logger.js'
import {openFleetDb} from '../../storage/db.js'
import {acquireFleetLock} from '../../storage/lock.js'

export interface CheckDeps {
  /** Acquire the fleet-check lock; return a release fn, or null if held. */
  acquireLock: () => (() => void) | null
  /** One scanFleet pass against the open DB. */
  scan: (db: Database.Database) => TickResult
}

export interface CheckOutcome {
  /** false when the lock was held (skipped). */
  ran: boolean
  result?: TickResult
  /** Human-readable skip reason when ran === false. */
  skipped?: string
}

/**
 * Pure check core: acquire lock → scan → release (always). Returns ran=false
 * when the lock was held. Throws propagate after release so a crashed scan
 * never deadlocks the next run.
 */
export function runFleetCheck(db: Database.Database | undefined, deps: CheckDeps): CheckOutcome {
  const release = deps.acquireLock()
  if (!release) return {ran: false, skipped: 'fleet check already running (lock held)'}

  try {
    const result = deps.scan(db!)
    return {ran: true, result}
  } finally {
    release()
  }
}

export default class FleetCheck extends Command {
  static description = 'Advance every active fleet one step (scan + heal + merge + spawn). Run manually or via cron.'
  static examples = [
    '<%= config.bin %> fleet check              # one pass now',
    '<%= config.bin %> fleet check --json       # machine-readable result',
  ]
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
    'log-level': Flags.string({
      default: 'info',
      description: 'Log level: error, warn, info, debug',
      options: ['error', 'warn', 'info', 'debug'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FleetCheck)
    configureLogger({level: flags['log-level'], silent: false})
    const config = loadConfig()
    const db = openFleetDb()

    const outcome = runFleetCheck(db, {
      acquireLock: () => acquireFleetLock(),
      scan: (d) => createFleetEngine(config).scanFleet(d),
    })

    db.close()

    if (!outcome.ran) {
      if (flags.json) this.log(JSON.stringify({ok: true, ran: false, skipped: outcome.skipped}))
      else logger.info(outcome.skipped ?? 'fleet check skipped')
      return
    }

    const {advanced = 0, lanesCreated = 0} = outcome.result ?? {}
    if (flags.json) {
      this.log(JSON.stringify({advanced, lanesCreated, ok: true, ran: true}))
    } else {
      logger.info(`fleet check: ${advanced} lane(s) advanced, ${lanesCreated} lane(s) created`)
    }
  }
}
