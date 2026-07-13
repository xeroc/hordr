/**
 * Shared winston logger (hordr-z4uy).
 *
 * All dispatch/tick/broker modules import `logger` from here. The daemon
 * command configures the level (--log-level flag, default info) and
 * transports (Console when foreground, silent when detached).
 *
 * Levels:
 *   error — merge conflicts, crashes, unrecoverable failures
 *   warn  — lane stuck, pane gone, non-fatal issues
 *   info  — lane created, task dispatched, epic merged, lifecycle events
 *   debug — per-tick scan details, per-epic ready/not-ready, rollup marks
 */
import winston from 'winston'

const LOG_FORMAT = winston.format.combine(
  winston.format.timestamp({format: 'HH:mm:ss'}),
  winston.format.colorize(),
  winston.format.printf(({level, message, timestamp}) => `${timestamp} ${level} ${message}`),
)

export const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console({format: LOG_FORMAT, silent: true})],
})

/** Configure the logger from the daemon command. */
export function configureLogger(opts: {level?: string; silent?: boolean}): void {
  if (opts.level) logger.level = opts.level
  if (opts.silent !== undefined) {
    for (const t of logger.transports) {
      t.silent = opts.silent
    }
  }
}
