/**
 * Shared winston logger (hordr-z4uy).
 *
 * All dispatch modules import `logger` from here. Since the daemon was removed
 * (ADR-0015) every invocation is a foreground CLI, so the console transport is
 * NOT silent by default — `scanFleet`'s per-lane diagnostics and swallowed
 * errors must surface. Commands that want a level override (e.g. `fleet check
 * --log-level debug`) call {@link configureLogger}; a detached/background
 * caller would pass `{silent: true}`.
 *
 * Levels:
 *   error — merge conflicts, crashes, unrecoverable failures
 *   warn  — lane stuck, pane gone, non-fatal issues (e.g. a lane whose advance threw)
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
  transports: [
    // stderr so diagnostic logs never pollute --json stdout (data goes via Command.log).
    new winston.transports.Console({
      format: LOG_FORMAT,
      silent: false,
      stderrLevels: ['error', 'warn', 'info', 'debug'],
    }),
  ],
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
