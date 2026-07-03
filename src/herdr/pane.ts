/**
 * Hordr's herdr pane + tab bridge. Tabs (not splits) for agent panes — each
 * agent gets its own tab. herdr always returns JSON.
 */

import {execFileSync} from 'node:child_process'

const HERDR_BIN = process.env.HERDR_BIN_PATH ?? 'herdr'

export class HerdrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HerdrError'
  }
}

// --- test seam ---
export type ShellFn = (args: string[], opts?: {cwd?: string}) => string

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

function herdr(args: string[]): string {
  try {
    return _shell(args)
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    throw new HerdrError(
      `herdr command failed: herdr ${args.join(' ')}\n${(e.stderr ?? e.message ?? '').slice(0, 200)}`,
    )
  }
}

function parseJSON<T>(raw: string, ctx: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new HerdrError(`herdr ${ctx} returned non-JSON: ${(error as Error).message}`)
  }
}

export interface PaneInfo {
  cwd?: string
  pane_id: string
  tab_id?: string
  workspace_id?: string
}

export interface CreateTabOpts {
  cwd: string
  label?: string
  workspaceId: string
}

/** Create a new tab in the given workspace; returns the root pane of the tab. */
export function createTab(opts: CreateTabOpts): PaneInfo {
  const args = ['tab', 'create', '--workspace', opts.workspaceId, '--cwd', opts.cwd]
  if (opts.label) args.push('--label', opts.label)

  const raw = herdr(args)
  const data = parseJSON<{
    error?: {code?: string; message?: string}
    result?: {root_pane?: PaneInfo; tab?: {tab_id?: string}}
  }>(raw, 'tab create')

  if (data.error) throw new HerdrError(`herdr tab create failed: ${JSON.stringify(data.error)}`)

  const pane = data.result?.root_pane
  if (!pane?.pane_id) throw new HerdrError(`herdr tab create returned no root_pane: ${raw.slice(0, 200)}`)

  return pane
}

/** Build a hordr-style pane label: `hordr:<bean-id>:<role>`. */
export function paneLabel(beanId: string, role: string): string {
  return `hordr:${beanId}:${role}`
}

/** Send a command (text + Enter) to a pane. */
export function runInPane(paneId: string, command: string): void {
  herdr(['pane', 'run', paneId, command])
}
