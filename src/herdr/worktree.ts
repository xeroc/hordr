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

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

// --- git seam (for the worktree-remove path; herdr is bypassed there) ---
export type GitShellFn = (args: string[], opts?: {cwd?: string}) => void

const defaultGit: GitShellFn = (args, opts) => {
  execFileSync('git', args, {cwd: opts?.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
}

let _git: GitShellFn = defaultGit

export function _setGitForTesting(fn: GitShellFn): void {
  _git = fn
}

export function _resetGit(): void {
  _git = defaultGit
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

  // --force is opt-in: by default git refuses a dirty worktree, which is the
  // defense-in-depth net (hordr-wd46). Only explicit callers (abort --force)
  // pass force=true to discard work deliberately.
  const args = ['worktree', 'remove', '--workspace', opts.workspaceId]
  if (opts.force) args.push('--force')
  args.push('--json')

  runHerdr(args)
}

/**
 * Remove a linked worktree by path via `git worktree remove` directly — no
 * herdr roundtrip, no --force. git itself refuses dirty/locked worktrees,
 * which is the safety net (hordr-wd46); --force is never passed because the
 * merge already landed and the caller's gates (bean completed + clean dir)
 * have already run. Tolerant of an already-gone worktree.
 *
 * `opts.cwd` MUST be set to a directory inside a git repository (the main
 * repo, the ms worktree, or any sibling worktree). `git worktree remove`
 * discovers the repo from cwd; without it the command runs from
 * process.cwd(), which fails with "not a git repository" when hordr runs
 * from cron or a non-git directory (hordr-ppsp).
 *
 * Replaces the old branch-based helper that roundtripped through
 * `herdr worktree open` to resolve a workspace_id: that path resolved the
 * main repo via `git rev-parse --git-common-dir`, which returns the relative
 * `.git` when cwd IS the main repo → `--cwd .` → herdr rejected it with
 * `linked_worktree_source`. We already hold the worktree path, so a direct
 * `git worktree remove <path>` sidesteps the whole class of errors.
 */
export function removeWorktreeByPath(worktreePath: string, opts?: {cwd?: string}): void {
  if (!worktreePath) throw new HerdrError('worktreePath is required')

  try {
    _git(['worktree', 'remove', worktreePath], {cwd: opts?.cwd})
  } catch (error) {
    const err = error as {message?: string; stderr?: {toString(): string}}
    const stderr = err.stderr?.toString() ?? err.message ?? ''
    // ponytail: "not a working tree" / "does not exist" means already gone —
    // tolerate it (lane was 'done'/merged, or fleet already torn down).
    if (/not a working tree|no working tree|does not exist|not a worktree/i.test(stderr)) return
    throw new HerdrError(`git worktree remove ${worktreePath} failed: ${stderr.slice(0, 200)}`)
  }
}

/**
 * Close a herdr workspace, removing all of its tabs and panes. Complements
 * {@link removeWorktreeByPath}: the worktree is torn down via raw git (herdr
 * isn't notified), so a lane's agent + merger tabs would otherwise linger as
 * orphaned terminal tabs. Best-effort: tolerates an already-gone workspace
 * (`workspace_not_found`) — a re-run after teardown must not fail.
 */
export function closeWorkspace(workspaceId: string): void {
  if (!workspaceId) throw new HerdrError('workspaceId is required')

  try {
    runHerdr(['workspace', 'close', workspaceId])
  } catch (error) {
    const e = error as {message?: string; stderr?: {toString(): string}; stdout?: {toString(): string}}
    const detail = `${e.message ?? ''} ${e.stderr?.toString() ?? ''} ${e.stdout?.toString() ?? ''}`
    // Already gone (re-run, or herdr cleaned it up first) — tolerate.
    if (/workspace_not_found/.test(detail)) return
    throw error
  }
}

/**
 * Compute the worktree branch name for a bean: the bean id itself.
 * Consistent with fleet lane naming (`laneBranchName` → epic id).
 * Example: branchFor("hordr-1234") => "hordr-1234"
 */
export function branchFor(beanId: string): string {
  if (!beanId) throw new HerdrError('beanId is required')
  return beanId
}
