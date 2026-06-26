/**
 * Synchronous wrapper around `herdr notification show`. Fires a toast visible
 * in herdr. The CLI prints nothing on success (it just shows the toast), so
 * empty stdout is treated as success; only a JSON error shape or a non-zero
 * exit is surfaced as HerdrNotifyError.
 */
import {execFileSync} from 'node:child_process'

const HERDR_BIN = process.env.HERDR_BIN_PATH ?? 'herdr'

export class HerdrNotifyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HerdrNotifyError'
  }
}

// --- test seam (mirrors src/herdr/wait.ts; shared seam avoided — worktree.ts
//     and pane.ts are owned by parallel agents, do not touch) ---
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

export interface NotifyOpts {
  body?: string
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  sound?: 'done' | 'none' | 'request'
  title: string
}

/** Fire a herdr toast. Empty stdout (the common case) is success. */
export function notify(opts: NotifyOpts): void {
  if (!opts.title) throw new HerdrNotifyError('notify: title is required')

  const args = ['notification', 'show', opts.title]
  if (opts.body) args.push('--body', opts.body)
  if (opts.position) args.push('--position', opts.position)
  if (opts.sound) args.push('--sound', opts.sound)

  let stdout: string
  try {
    stdout = _shell(args)
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    throw new HerdrNotifyError(`notification show exited non-zero: ${(e.stderr ?? e.message ?? '').slice(0, 200)}`)
  }

  const trimmed = stdout.trim()
  if (!trimmed) return // empty stdout = success (toast fired, nothing printed)
  let parsed: {error?: {code?: string; message?: string}}
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return // non-JSON, non-empty — not an error shape, treat as success
  }

  if (parsed.error) {
    throw new HerdrNotifyError(`notification show failed: ${parsed.error.code ?? ''} ${parsed.error.message ?? ''}`)
  }
}
