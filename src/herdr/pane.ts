/**
 * Hordr's herdr pane bridge.
 *
 * SPEC §5 says "resolve panes by label", but herdr CLI v0.7.0 cannot query
 * labels back (verified: `pane list`/`pane get` return no `label` field;
 * only `pane rename` sets them, for TUI display). So:
 *   - Hordr tracks pane_ids in Run state (run.panes: Record<role, pane_id>).
 *   - Labels are set via `pane rename` for human UX in herdr's TUI only.
 *   - Pane existence is verified via `pane get <pane_id>` (pane_not_found ⇒ gone).
 *
 * `findPane(workspaceId, paneId)` below reinterprets the AC's label-based
 * signature as a pane_id-based existence check. The `workspaceId` arg is
 * accepted for API compatibility but unused — pane_ids are globally unique
 * with their workspace prefix (e.g. `wJ:p2`).
 *
 * hordr:pane parentPaneId is the primary selector for `pane split` (it carries
 * the workspace via the pane_id prefix); `--workspace` is not documented for
 * `pane split` in herdr's help output, so we omit it and pass `--pane` only.
 */
/* eslint-disable camelcase -- field names mirror herdr's on-the-wire JSON contract (pane_id, tab_id, workspace_id) */
import {execFileSync} from 'node:child_process'

const HERDR_BIN = process.env.HERDR_BIN_PATH ?? 'herdr'

export class HerdrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HerdrError'
  }
}

// --- test seams (module-level mutables; `_`-prefix marks non-public API) ---
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
    const snippet = (e.stderr ?? e.message ?? '').slice(0, 200)
    throw new HerdrError(`herdr command failed: herdr ${args.join(' ')}\n${snippet}`)
  }
}

function parseJSON<T>(raw: string, ctx: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new HerdrError(`herdr ${ctx} returned non-JSON: ${(error as Error).message}`)
  }
}

function requireNonEmpty(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new HerdrError(`${name} must be a non-empty string`)
  }
}

/** Build a hordr-style pane label: `hordr:<bean-id>:<role>`. */
export function paneLabel(beanId: string, role: string): string {
  return `hordr:${beanId}:${role}`
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
  env?: Record<string, string>
  focus?: boolean
  /** If set, renamePane is called after a successful split. */
  label?: string
  /** REQUIRED — carries workspace via the `wJ:p2` prefix. */
  parentPaneId: string
  ratio?: number
}

// pane_id format: `<workspace>:p<digits>`. Fallback scanner for split
// responses with an unexpected shape.
const PANE_ID_RE = /^[a-z0-9]+:p\d+$/

function scanForPaneId(obj: unknown): string | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (typeof v === 'string' && PANE_ID_RE.test(v)) return v
    if (typeof v === 'object' && v !== null) {
      const found = scanForPaneId(v)
      if (found) return found
    }
  }

  return undefined
}

function extractPane(data: unknown, raw: string, ctx: string): PaneInfo {
  const obj = data as Partial<PaneInfo> & {
    error?: unknown
    pane?: PaneInfo
    result?: Partial<PaneInfo> & {pane?: PaneInfo}
  }
  if (obj.error) {
    throw new HerdrError(`herdr ${ctx} failed: ${JSON.stringify(obj.error)}`)
  }

  const result = (obj.result ?? obj) as Partial<PaneInfo> & {pane?: PaneInfo}
  const pane = result.pane ?? result
  const pane_id = pane.pane_id ?? scanForPaneId(obj)
  if (!pane_id) {
    throw new HerdrError(`herdr ${ctx} returned no pane_id: ${raw.slice(0, 200)}`)
  }

  return {cwd: pane.cwd, pane_id, tab_id: pane.tab_id, workspace_id: pane.workspace_id}
}

// --- split ---

export function splitPane(opts: PaneSplitOpts): PaneInfo {
  requireNonEmpty(opts.parentPaneId, 'parentPaneId')
  if (opts.direction !== 'right' && opts.direction !== 'down') {
    throw new HerdrError(`direction must be 'right' or 'down' (got ${JSON.stringify(opts.direction)})`)
  }

  const args = ['pane', 'split', '--json', '--direction', opts.direction, '--pane', opts.parentPaneId]
  if (opts.cwd) args.push('--cwd', opts.cwd)
  if (opts.ratio !== undefined) args.push('--ratio', String(opts.ratio))
  if (opts.env) for (const [k, v] of Object.entries(opts.env)) args.push('--env', `${k}=${v}`)
  if (opts.focus === true) args.push('--focus')
  else if (opts.focus === false) args.push('--no-focus')

  const raw = herdr(args)
  const info = extractPane(parseJSON(raw, 'pane split'), raw, 'pane split')

  if (opts.label) {
    renamePane(info.pane_id, opts.label) // fire-and-forget: caller gets a labeled pane in one call
  }

  return info
}

export function renamePane(paneId: string, label: string): void {
  requireNonEmpty(paneId, 'paneId')
  requireNonEmpty(label, 'label')
  // herdr `pane rename` returns plain text/empty; output ignored.
  herdr(['pane', 'rename', paneId, label])
}

/** Convenience: split + rename in one call. Step handlers spawn labeled panes via this. */
export function splitLabeled(opts: {
  cwd?: string
  direction?: 'down' | 'right'
  focus?: boolean
  label: string
  parentPaneId: string
  ratio?: number
}): PaneInfo {
  return splitPane({
    cwd: opts.cwd,
    direction: opts.direction ?? 'right',
    focus: opts.focus,
    label: opts.label,
    parentPaneId: opts.parentPaneId,
    ratio: opts.ratio,
  })
}

// --- find (AC reinterpretation) ---

/**
 * AC reinterpretation: herdr CLI v0.7.0 cannot query labels (verified).
 * This validates a pane_id is still alive via `pane get`.
 * `workspaceId` is accepted for API compatibility with the AC's
 * `findPane(workspaceId, label)` signature but unused — pane_ids carry
 * their workspace prefix. Returns PaneInfo if alive, null if closed/gone.
 */
export function findPane(workspaceId: string, paneId: string): null | PaneInfo {
  // workspaceId intentionally unused — kept for AC signature compat; pane_ids carry their workspace prefix.
  requireNonEmpty(paneId, 'paneId')

  const raw = herdr(['pane', 'get', paneId, '--json'])
  const data = parseJSON<
    Partial<PaneInfo> & {
      error?: {code?: string; message?: string}
      result?: Partial<PaneInfo> & {pane?: PaneInfo}
    }
  >(raw, 'pane get')

  if (data.error) {
    if (data.error.code === 'pane_not_found') return null
    throw new HerdrError(`herdr pane get failed: ${JSON.stringify(data.error)}`)
  }

  return extractPane(data, raw, 'pane get')
}

/**
 * List panes in a workspace. Returns empty array if the workspace has no panes.
 * Used by the runtime to find a parent pane to split from when spawning agents.
 */
export function listPanes(workspaceId: string): PaneInfo[] {
  requireNonEmpty(workspaceId, 'workspaceId')
  return listPanesImpl(['--workspace', workspaceId])
}

/**
 * Find any pane in any workspace (no workspace filter). Used by commands like
 * `decompose` that spawn a planner pane from wherever the human happens to be.
 * Returns the pane_id of the first pane, or undefined if no panes exist.
 */
export function findAnyPane(): string | undefined {
  return listPanesImpl([])[0]?.pane_id
}

function listPanesImpl(extraArgs: string[]): PaneInfo[] {
  const raw = herdr(['pane', 'list', ...extraArgs, '--json'])
  const data = parseJSON<{
    error?: {code?: string; message?: string}
    result?: {panes?: PaneInfo[]}
  }>(raw, 'pane list')
  if (data.error) {
    throw new HerdrError(`herdr pane list failed: ${JSON.stringify(data.error)}`)
  }

  return data.result?.panes ?? []
}

// --- run / send / read / close ---

export function runInPane(paneId: string, command: string): void {
  requireNonEmpty(paneId, 'paneId')
  requireNonEmpty(command, 'command')
  herdr(['pane', 'run', paneId, command])
}

export function sendText(paneId: string, text: string): void {
  requireNonEmpty(paneId, 'paneId')
  requireNonEmpty(text, 'text')
  herdr(['pane', 'send-text', paneId, text])
}

export interface ReadPaneOpts {
  format?: 'ansi' | 'text'
  lines?: number
  paneId: string
  source?: 'recent' | 'recent-unwrapped' | 'visible'
}

export function readPane(opts: ReadPaneOpts): string {
  requireNonEmpty(opts.paneId, 'paneId')
  const raw = herdr([
    'pane',
    'read',
    opts.paneId,
    '--source',
    opts.source ?? 'recent',
    '--lines',
    String(opts.lines ?? 200),
    '--format',
    opts.format ?? 'text',
  ])
  // Heuristic: herdr pane read has no --json flag (per help), so output is
  // plain text by default. Some RPC surfaces may still wrap as JSON; unwrap.
  if (raw.startsWith('{"id":"cli:pane:read"')) {
    const data = parseJSON<{result?: {output?: string; text?: string}}>(raw, 'pane read')
    return data.result?.text ?? data.result?.output ?? raw
  }

  return raw
}

export function closePane(paneId: string): void {
  requireNonEmpty(paneId, 'paneId')
  herdr(['pane', 'close', paneId])
}
