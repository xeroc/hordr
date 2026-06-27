/**
 * Hordr's herdr pane bridge.
 *
 * herdr v0.7.0 pane list/get return no `label` field; only `pane rename` sets
 * them (for TUI display). Hordr tracks pane_ids in Run state. Labels are set
 * via rename for human UX only.
 */
/* eslint-disable camelcase -- field names mirror herdr's JSON contract */
import {execFileSync} from 'node:child_process'
import process from 'node:process'

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

// --- types ---

export interface PaneInfo {
  cwd?: string
  pane_id: string
  tab_id?: string
  workspace_id?: string
}

export interface PaneSplitOpts {
  cwd?: string
  direction: 'down' | 'right'
  focus?: boolean
  /** If set, pane rename is called after split. */
  label?: string
  parentPaneId: string
}

// --- split ---

export function splitPane(opts: PaneSplitOpts): PaneInfo {
  const args = ['pane', 'split', '--json', '--direction', opts.direction, '--pane', opts.parentPaneId]
  if (opts.cwd) args.push('--cwd', opts.cwd)
  if (opts.focus === true) args.push('--focus')
  else if (opts.focus === false) args.push('--no-focus')

  const raw = herdr(args)
  const data = parseJSON<
    Partial<PaneInfo> & {error?: {code?: string}; pane?: PaneInfo; result?: Partial<PaneInfo> & {pane?: PaneInfo}}
  >(raw, 'pane split')

  if (data.error) throw new HerdrError(`herdr pane split failed: ${JSON.stringify(data.error)}`)

  const result = (data.result ?? data) as Partial<PaneInfo> & {pane?: PaneInfo}
  const pane = result.pane ?? result
  const {pane_id} = pane
  if (!pane_id) throw new HerdrError(`herdr pane split returned no pane_id: ${raw.slice(0, 200)}`)

  const info: PaneInfo = {cwd: pane.cwd, pane_id, tab_id: pane.tab_id, workspace_id: pane.workspace_id}

  if (opts.label) {
    herdr(['pane', 'rename', pane_id, opts.label])
  }

  return info
}

/** Build a hordr-style pane label: `hordr:<bean-id>:<role>`. */
export function paneLabel(beanId: string, role: string): string {
  return `hordr:${beanId}:${role}`
}

// --- find ---

export function findPane(paneId: string): null | PaneInfo {
  const raw = herdr(['pane', 'get', paneId, '--json'])
  const data = parseJSON<
    Partial<PaneInfo> & {error?: {code?: string; message?: string}; result?: Partial<PaneInfo> & {pane?: PaneInfo}}
  >(raw, 'pane get')

  if (data.error) {
    if (data.error.code === 'pane_not_found') return null
    throw new HerdrError(`herdr pane get failed: ${JSON.stringify(data.error)}`)
  }

  const result = (data.result ?? data) as Partial<PaneInfo> & {pane?: PaneInfo}
  const pane = result.pane ?? result
  if (!pane.pane_id) return null
  return {cwd: pane.cwd, pane_id: pane.pane_id, tab_id: pane.tab_id, workspace_id: pane.workspace_id}
}

// --- list ---

export function listPanes(workspaceId: string): PaneInfo[] {
  return listPanesImpl(['--workspace', workspaceId])
}

export function findAnyPane(): string | undefined {
  return listPanesImpl([])[0]?.pane_id
}

function listPanesImpl(extraArgs: string[]): PaneInfo[] {
  const raw = herdr(['pane', 'list', ...extraArgs, '--json'])
  const data = parseJSON<{error?: {code?: string}; result?: {panes?: PaneInfo[]}}>(raw, 'pane list')
  if (data.error) throw new HerdrError(`herdr pane list failed: ${JSON.stringify(data.error)}`)
  return data.result?.panes ?? []
}

// --- run / send ---

export function runInPane(paneId: string, command: string): void {
  herdr(['pane', 'run', paneId, command])
}

export function sendText(paneId: string, text: string): void {
  herdr(['pane', 'send-text', paneId, text])
}
