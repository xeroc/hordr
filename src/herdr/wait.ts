/**
 * Synchronous wrappers around `herdr wait agent-status`.
 * BLOCKS the calling supervisor pane until a match appears — intentional
 * (hordr is a CLI, not a server).
 *
 * herdr emits JSON-RPC-shaped stdout; errors arrive either as
 * `{"error":{...}}` on exit 0 (e.g. timeout) or as a non-zero process exit.
 */
import {execFileSync} from 'node:child_process'
import process from 'node:process'

const HERDR_BIN = process.env.HERDR_BIN_PATH ?? 'herdr'

export class HerdrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HerdrError'
  }
}

/** Timeout specifically — lets callers branch on wait expiry vs other failures. */
export class HerdrWaitTimeout extends HerdrError {
  constructor(message: string) {
    super(message)
    this.name = 'HerdrWaitTimeout'
  }
}

// --- test seam ---
export type ShellFn = (args: string[]) => string

const defaultShell: ShellFn = (args) =>
  execFileSync(HERDR_BIN, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) as unknown as string

let _shell: ShellFn = defaultShell

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- herdr result shape varies; callers narrow.
function invoke(args: string[], paneId: string, cmd: string): any {
  let stdout: string
  try {
    stdout = _shell(args)
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    throw new HerdrError(`${cmd} for pane ${paneId} exited non-zero: ${(e.stderr ?? e.message ?? '').slice(0, 200)}`)
  }

  const trimmed = stdout.trim()
  if (!trimmed) return null
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed
  }

  const err = parsed?.error
  if (err) {
    if (err.code === 'timeout') throw new HerdrWaitTimeout(`${cmd} for pane ${paneId} timed out: ${err.message ?? ''}`)
    throw new HerdrError(`${cmd} for pane ${paneId} failed: ${err.code} ${err.message ?? ''}`)
  }

  return parsed?.result ?? parsed
}

export interface WaitAgentStatusOpts {
  paneId: string
  status: 'blocked' | 'done' | 'idle' | 'unknown' | 'working'
  timeoutMs: number
}

/** Block until `herdr wait agent-status` reports the requested status. */
export function waitAgentStatus(opts: WaitAgentStatusOpts): void {
  const args = ['wait', 'agent-status', opts.paneId, '--status', opts.status, '--timeout', String(opts.timeoutMs)]
  invoke(args, opts.paneId, 'wait agent-status')
}
