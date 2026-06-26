/* eslint-disable camelcase -- field names mirror the herdr CLI JSON contract */
/**
 * Thin synchronous wrapper around the `herdr worktree` subcommands. Hordr is a
 * CLI tool (not a server), so blocking shell-outs are fine and keep call sites
 * simple. Mirrors the seam pattern in `src/beans/client.ts`.
 */
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

const defaultShell: ShellFn = (args, opts) => {
  try {
    return execFileSync(HERDR_BIN, args, {
      cwd: opts?.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as unknown as string
  } catch (error) {
    // Wrap non-zero exits so callers get one error type with the stderr snippet.
    const err = error as {message?: string; stderr?: {toString(): string}}
    const stderr = err.stderr?.toString() ?? ''
    throw new HerdrError(
      `herdr ${args.join(' ')} failed: ${err.message ?? ''}${stderr ? ` (stderr: ${stderr.slice(0, 200)})` : ''}`,
    )
  }
}

let _shell: ShellFn = defaultShell
let _herdrPresent = true

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

export function _setHerdrPresentForTesting(present: boolean): void {
  _herdrPresent = present
}

function assertHerdrOnPath(): void {
  if (!_herdrPresent) throw new HerdrError('herdr CLI not found on PATH')
  try {
    execFileSync('sh', ['-c', `command -v ${HERDR_BIN}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new HerdrError('herdr CLI not found on PATH')
  }
}

/** Run `herdr <args>`, parse the JSON envelope, throw HerdrError on `.error`. */
function runHerdr(args: string[], cwd?: string): Record<string, unknown> {
  const raw = _shell(args, {cwd})
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new HerdrError(`herdr ${args.join(' ')} returned non-JSON: ${(error as Error).message}`)
  }

  const env = data as {error?: {code?: string; message?: string}; result?: Record<string, unknown>}
  if (env.error) {
    throw new HerdrError(`herdr ${args.join(' ')} error: ${env.error.code ?? '?'}: ${env.error.message ?? '?'}`)
  }

  return env.result ?? {}
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

// --- create ---
export interface WorktreeCreateOpts {
  base?: string
  branch: string
  // herdr requires --workspace OR --cwd; exactly one must be set.
  cwd?: string
  focus?: boolean
  label?: string
  workspaceId?: string
}

export interface WorktreeInfo {
  branch: string
  path?: string
  root_pane_id?: string
  workspace_id: string
}

export function createWorktree(opts: WorktreeCreateOpts): WorktreeInfo {
  if (!opts.branch) throw new HerdrError('branch is required')
  if (!opts.cwd && !opts.workspaceId) throw new HerdrError('cwd or workspaceId is required')
  if (opts.cwd && opts.workspaceId) throw new HerdrError('cwd and workspaceId are mutually exclusive')

  assertHerdrOnPath()

  const args = ['worktree', 'create', '--json']
  if (opts.cwd) args.push('--cwd', opts.cwd)
  if (opts.workspaceId) args.push('--workspace', opts.workspaceId)
  args.push('--branch', opts.branch)
  if (opts.base) args.push('--base', opts.base)
  if (opts.label) args.push('--label', opts.label)
  if (opts.focus === true) args.push('--focus')
  if (opts.focus === false) args.push('--no-focus')

  const r = runHerdr(args, opts.cwd)
  const workspace = obj(r.workspace)
  const worktree = obj(r.worktree)
  const rootPane = obj(r.root_pane)

  const workspaceId = (r.workspace_id as string | undefined) ?? (workspace.workspace_id as string | undefined)
  if (!workspaceId) {
    throw new HerdrError(`herdr ${args.join(' ')}: result missing workspace_id`)
  }

  const info: WorktreeInfo = {
    branch: (worktree.branch as string | undefined) ?? opts.branch,
    workspace_id: workspaceId,
  }
  if (worktree.path) info.path = worktree.path as string
  if (rootPane.pane_id) info.root_pane_id = rootPane.pane_id as string
  return info
}

// --- open ---
export interface WorktreeOpenOpts {
  // herdr requires --path OR --branch for open.
  branch?: string
  cwd?: string
  focus?: boolean
  label?: string
  path?: string
  workspaceId?: string
}

export interface WorktreeOpenInfo {
  workspace_id: string
}

export function openWorktree(opts: WorktreeOpenOpts): WorktreeOpenInfo {
  if (!opts.path && !opts.branch) throw new HerdrError('path or branch is required')
  if (!opts.cwd && !opts.workspaceId) throw new HerdrError('cwd or workspaceId is required')
  if (opts.cwd && opts.workspaceId) throw new HerdrError('cwd and workspaceId are mutually exclusive')

  assertHerdrOnPath()

  const args = ['worktree', 'open', '--json']
  if (opts.cwd) args.push('--cwd', opts.cwd)
  if (opts.workspaceId) args.push('--workspace', opts.workspaceId)
  if (opts.path) args.push('--path', opts.path)
  if (opts.branch) args.push('--branch', opts.branch)
  if (opts.label) args.push('--label', opts.label)
  if (opts.focus === true) args.push('--focus')
  if (opts.focus === false) args.push('--no-focus')

  const r = runHerdr(args, opts.cwd)
  const workspaceId = (r.workspace_id as string | undefined) ?? (obj(r.workspace).workspace_id as string | undefined)
  if (!workspaceId) {
    throw new HerdrError(`herdr ${args.join(' ')}: result missing workspace_id`)
  }

  return {workspace_id: workspaceId}
}

// --- remove ---
export interface WorktreeRemoveOpts {
  force?: boolean
  workspaceId: string
}

export function removeWorktree(opts: WorktreeRemoveOpts): void {
  if (!opts.workspaceId) throw new HerdrError('workspaceId is required')

  assertHerdrOnPath()

  const args = ['worktree', 'remove', '--workspace', opts.workspaceId, '--json']
  if (opts.force) args.push('--force')

  runHerdr(args)
}

/**
 * Compute the worktree branch name for a bean: `<prefix><beanId>`.
 * The prefix comes from hordr config (default "bean/", SPEC §6).
 * Example: branchFor("hordr-1234", "bean/") => "bean/hordr-1234"
 */
export function branchFor(beanId: string, branchPrefix = 'bean/'): string {
  if (!beanId) throw new HerdrError('beanId is required')
  return `${branchPrefix}${beanId}`
}
