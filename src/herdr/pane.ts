/**
 * Hordr's herdr pane + tab bridge.
 *
 * Uses tabs (not splits) for agent panes — cleaner when many agents run in
 * parallel. Each agent gets its own tab with a hordr:<bean>:<role> label.
 */
/* eslint-disable camelcase -- field names mirror herdr's JSON contract */
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

// --- types ---

export interface PaneInfo {
  cwd?: string
  pane_id: string
  tab_id?: string
  workspace_id?: string
}

// --- tab creation (preferred over pane split for agent panes) ---

export interface CreateTabOpts {
  cwd: string
  label?: string
  workspaceId: string
}

/**
 * Create a new tab in the given workspace. Returns the root pane of the new tab.
 * This is the preferred way to spawn agent panes — each agent gets its own tab.
 */
export function createTab(opts: CreateTabOpts): PaneInfo {
  const args = ['tab', 'create', '--workspace', opts.workspaceId, '--cwd', opts.cwd, '--json']
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
  const raw = herdr(['pane', 'list', '--workspace', workspaceId, '--json'])
  const data = parseJSON<{error?: {code?: string}; result?: {panes?: PaneInfo[]}}>(raw, 'pane list')
  if (data.error) throw new HerdrError(`herdr pane list failed: ${JSON.stringify(data.error)}`)
  return data.result?.panes ?? []
}

/** Find the workspace_id of any pane in the session. Used as fallback when HERDR_PANE_ID is unset. */
export function findAnyPane(): string | undefined {
  const raw = herdr(['pane', 'list', '--json'])
  const data = parseJSON<{result?: {panes?: PaneInfo[]}}>(raw, 'pane list')
  return data.result?.panes?.[0]?.pane_id
}

// --- pane interaction ---

/** Send a command (text + Enter) to a pane. Use for shell commands like starting a binary. */
export function runInPane(paneId: string, command: string): void {
  herdr(['pane', 'run', paneId, command])
}

/** Type raw text into a pane (no Enter). Use for multi-line prompts. */
export function sendText(paneId: string, text: string): void {
  herdr(['pane', 'send-text', paneId, text])
}

/** Press Enter in a pane. Submits whatever is in the input buffer. */
export function sendEnter(paneId: string): void {
  herdr(['pane', 'send-keys', paneId, 'Enter'])
}
