/**
 * Hordr's herdr pane + tab bridge. Tabs (not splits) for agent panes — each
 * agent gets its own tab. herdr always returns JSON.
 */

import {execFileSync} from 'node:child_process'

export {HerdrError} from './worktree.js'
import {HerdrError} from './worktree.js'

const HERDR_BIN = process.env.HERDR_BIN_PATH ?? 'herdr'

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

interface PaneListEntry {
  agent?: string
  agent_status?: string
  pane_id?: string
}

/**
 * Fetch all panes from herdr. Returns null if herdr can't confirm (error or
 * unexpected response shape). A valid empty list returns [].
 */
function fetchPanes(): null | PaneListEntry[] {
  try {
    const raw = herdr(['pane', 'list'])
    const data = parseJSON<{result?: {panes?: PaneListEntry[]}}>(raw, 'pane list')
    return data.result?.panes ?? null
  } catch {
    return null
  }
}

/**
 * Whether a pane still exists. Returns false if herdr can't confirm — a
 * broken pane-list API must not mask a dead agent.
 */
export function paneExists(paneId: string): boolean {
  const panes = fetchPanes()
  if (panes === null) return false
  return panes.some((p) => p.pane_id === paneId)
}

/**
 * Whether a pane exists AND has an agent session registered in it. The heal
 * check uses this instead of {@link paneExists}: a pane can survive as a
 * terminal tab after the agent exits — the `agent` field disappears, and
 * that's the signal the invocation is dead.
 */
export function agentActiveInPane(paneId: string): boolean {
  const panes = fetchPanes()
  if (panes === null) return false
  const pane = panes.find((p) => p.pane_id === paneId)
  if (!pane) return false
  return pane.agent !== undefined
}
