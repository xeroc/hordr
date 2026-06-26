/**
 * Synchronous wrappers around `herdr wait output` and `herdr wait agent-status`.
 * These BLOCK the calling supervisor pane until a match appears or an agent
 * reaches a status — that is intentional (hordr is a CLI, not a server).
 *
 * herdr emits JSON-RPC-shaped stdout; errors arrive either as
 * `{"error":{...}}` on exit 0 (e.g. timeout) or as a non-zero process exit.
 * Both are normalized into HerdrError / HerdrWaitTimeout here so callers only
 * branch on our error classes, never on herdr's wire shape.
 */
import {execFileSync} from 'node:child_process'

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

// --- test seam (mirrors src/beans/client.ts) ---
export interface ShellOptions {
  cwd?: string
}
export type ShellFn = (args: string[], opts?: ShellOptions) => string

const defaultShell: ShellFn = (args, opts) =>
  execFileSync(HERDR_BIN, args, {
    cwd: opts?.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string

let _shell: ShellFn = defaultShell

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- herdr result shape varies per command; callers narrow.
function parseHerdrResult(stdout: string, paneId: string, cmd: string): any {
  const trimmed = stdout.trim()
  if (!trimmed) return null // empty stdout (e.g. notification) = success
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed // plain text — return as-is
  }

  const err = parsed?.error
  if (err) {
    if (err.code === 'timeout') {
      throw new HerdrWaitTimeout(`${cmd} for pane ${paneId} timed out: ${err.message ?? ''}`)
    }

    throw new HerdrError(`${cmd} for pane ${paneId} failed: ${err.code} ${err.message ?? ''}`)
  }

  return parsed?.result ?? parsed
}

/** Run herdr, convert a non-zero exit to HerdrError, then parse stdout. */
function invoke(args: string[], paneId: string, cmd: string) {
  let stdout: string
  try {
    stdout = _shell(args)
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    const snippet = (e.stderr ?? e.message ?? '').slice(0, 200)
    throw new HerdrError(`${cmd} for pane ${paneId} exited non-zero: ${snippet}`)
  }

  return parseHerdrResult(stdout, paneId, cmd)
}

export interface WaitOutputOpts {
  isRegex?: boolean
  lines?: number
  match: string
  paneId: string
  source?: 'recent' | 'recent-unwrapped' | 'visible'
  timeoutMs: number
}

/**
 * Block until `herdr wait output` matches. Returns matched text, preferring
 * `result.match`, then `result.text`, then `result.output`; falls back to the
 * raw string herdr printed when it does not emit structured JSON.
 */
export function waitOutput(opts: WaitOutputOpts): string {
  if (!opts.paneId) throw new HerdrError('waitOutput: paneId is required')
  if (!opts.match) throw new HerdrError('waitOutput: match is required')
  if (!(opts.timeoutMs > 0)) throw new HerdrError('waitOutput: timeoutMs must be > 0')

  const args = [
    'wait',
    'output',
    opts.paneId,
    '--match',
    opts.match,
    '--source',
    opts.source ?? 'recent',
    '--lines',
    String(opts.lines ?? 200),
    '--timeout',
    String(opts.timeoutMs),
  ]
  if (opts.isRegex) args.push('--regex')

  const result = invoke(args, opts.paneId, 'wait output')
  if (result && typeof result === 'object') {
    const r = result as {match?: string; output?: string; text?: string}
    return r.match ?? r.text ?? r.output ?? ''
  }

  return typeof result === 'string' ? result : ''
}

export interface WaitAgentStatusOpts {
  paneId: string
  status: 'blocked' | 'done' | 'idle' | 'unknown' | 'working'
  timeoutMs: number
}

const AGENT_STATUSES = new Set(['blocked', 'done', 'idle', 'unknown', 'working'])

/** Block until `herdr wait agent-status` reports the requested status. */
export function waitAgentStatus(opts: WaitAgentStatusOpts): void {
  if (!opts.paneId) throw new HerdrError('waitAgentStatus: paneId is required')
  if (!AGENT_STATUSES.has(opts.status)) {
    throw new HerdrError(`waitAgentStatus: invalid status ${JSON.stringify(opts.status)}`)
  }

  if (!(opts.timeoutMs > 0)) throw new HerdrError('waitAgentStatus: timeoutMs must be > 0')

  const args = ['wait', 'agent-status', opts.paneId, '--status', opts.status, '--timeout', String(opts.timeoutMs)]
  invoke(args, opts.paneId, 'wait agent-status')
}
