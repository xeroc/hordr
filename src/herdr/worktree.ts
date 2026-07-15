/* eslint-disable camelcase -- field names mirror the herdr CLI JSON contract */
/**
 * Thin synchronous wrapper around the `herdr worktree` subcommands. Hordr is a
 * CLI tool (not a server), so blocking shell-outs are fine and keep call sites
 * simple. Mirrors the seam pattern in `src/beans/client.ts`.
 */
import {execFileSync} from 'node:child_process'
import path from 'node:path'

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

  return parseWorktreeResult(runHerdr(args, opts.cwd), opts.branch, args)
}

// --- open (idempotent): used to recover when create reports the branch already exists ---
export interface WorktreeOpenOpts {
  branch?: string
  // herdr requires --workspace OR --cwd; exactly one must be set.
  cwd?: string
  label?: string
  path?: string
  workspaceId?: string
}

export function openWorktree(opts: WorktreeOpenOpts): WorktreeInfo {
  if (!opts.branch && !opts.path) throw new HerdrError('branch or path is required')
  if (!opts.cwd && !opts.workspaceId) throw new HerdrError('cwd or workspaceId is required')
  if (opts.cwd && opts.workspaceId) throw new HerdrError('cwd and workspaceId are mutually exclusive')

  assertHerdrOnPath()

  const args = ['worktree', 'open', '--json']
  if (opts.cwd) args.push('--cwd', opts.cwd)
  if (opts.workspaceId) args.push('--workspace', opts.workspaceId)
  if (opts.branch) args.push('--branch', opts.branch)
  if (opts.path) args.push('--path', opts.path)
  if (opts.label) args.push('--label', opts.label)

  return parseWorktreeResult(runHerdr(args, opts.cwd), opts.branch ?? '(path)', args)
}

/** Shared response parser for create/open: both return the same worktree result envelope. */
function parseWorktreeResult(r: Record<string, unknown>, fallbackBranch: string, args: string[]): WorktreeInfo {
  const workspace = obj(r.workspace)
  const worktree = obj(r.worktree)
  const rootPane = obj(r.root_pane)

  const workspaceId = (r.workspace_id as string | undefined) ?? (workspace.workspace_id as string | undefined)
  if (!workspaceId) {
    throw new HerdrError(`herdr ${args.join(' ')}: result missing workspace_id`)
  }

  const info: WorktreeInfo = {
    branch: (worktree.branch as string | undefined) ?? fallbackBranch,
    workspace_id: workspaceId,
  }
  if (worktree.path) info.path = worktree.path as string
  if (rootPane.pane_id) info.root_pane_id = rootPane.pane_id as string
  return info
}

// --- remove ---
export interface WorktreeRemoveOpts {
  force?: boolean
  workspaceId: string
}

export function removeWorktree(opts: WorktreeRemoveOpts): void {
  if (!opts.workspaceId) throw new HerdrError('workspaceId is required')

  assertHerdrOnPath()

  // --force is opt-in: by default git refuses a dirty worktree, which is the
  // defense-in-depth net (hordr-wd46). Only explicit callers (abort --force)
  // pass force=true to discard work deliberately.
  const args = ['worktree', 'remove', '--workspace', opts.workspaceId]
  if (opts.force) args.push('--force')
  args.push('--json')

  runHerdr(args)
}

/**
 * Remove a worktree by its branch: open (resolve workspace) then remove.
 * Tolerant of an already-gone worktree (lane was 'done' / merged). Used by
 * the broker's epic-merge teardown. Does NOT force — dirty trees are refused
 * so uncommitted work survives (hordr-wd46). The abort --force path passes
 * force=true explicitly via its own helper.
 */
export function removeWorktreeByBranch(branch: string, cwd: string, opts?: {force?: boolean}): void {
  // herdr worktree open/remove must run from the repo parent workspace, not
  // from inside a linked worktree. Resolve the main repo from any cwd.
  let mainRepo = cwd
  try {
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    mainRepo = path.dirname(gitCommonDir)
  } catch {
    // If git fails, fall back to the given cwd
  }

  let workspaceId: string | undefined
  try {
    const result = openWorktree({branch, cwd: mainRepo})
    workspaceId = result.workspace_id
  } catch (error) {
    if (!(error instanceof HerdrError) || !/worktree_not_found/.test(error.message)) throw error
    return // already gone
  }

  if (workspaceId) removeWorktree({force: opts?.force, workspaceId})
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
