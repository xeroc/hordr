/**
 * Global resolution of the `beans` CLI binary path (hordr-ekgs).
 *
 * Every module that shells out to `beans` imports `BEANS_BIN` from here so the
 * resolution lives in ONE place. Resolution order:
 *
 * 1. `BEANS_BIN_PATH` env var — explicit override (mirrors `HERDR_BIN_PATH`).
 * 2. `command -v beans` — resolves via the shell PATH at module load.
 * 3. `'beans'` — bare-name fallback; the first `execFileSync` call will throw
 *    `ENOENT` if beans truly isn't installed, which is the natural signal.
 */
import {execFileSync} from 'node:child_process'

export function resolveBeansBin(): string {
  if (process.env.BEANS_BIN_PATH) return process.env.BEANS_BIN_PATH

  try {
    return execFileSync('sh', ['-c', 'command -v beans'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'beans'
  }
}

/** Resolved beans binary path — shared by all callers (client.ts, dispatch.ts). */
export const BEANS_BIN = resolveBeansBin()
