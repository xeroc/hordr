/**
 * Project identity resolution (ADR-0012).
 *
 * The project key is `git rev-parse --git-common-dir` — stable across all
 * worktrees of one clone (every worktree shares the same common dir), and
 * different across clones/repos. This is the routing property the daemon
 * needs: a member calling `hordr done` from a milestone worktree resolves to
 * the same project as the human who ran `fleet create` from the main repo.
 */
import {execFileSync} from 'node:child_process'
import path from 'node:path'

export class ProjectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectError'
  }
}

/**
 * Resolve the project key from the given directory (defaults to cwd).
 * Shells out to `git rev-parse --git-common-dir` and returns the absolute path.
 */
export function resolveProjectKey(opts?: {cwd?: string}): string {
  let raw: string
  try {
    raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: opts?.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const e = error as {stderr?: {toString(): string}}
    throw new ProjectError(
      `not in a git repository${opts?.cwd ? `: ${opts.cwd}` : ''}: ${e.stderr?.toString().trim() ?? ''}`,
    )
  }

  if (!raw) throw new ProjectError('git rev-parse --git-common-dir returned empty')

  // git may return a relative path; resolve to absolute so it's stable as cwd.
  return path.resolve(opts?.cwd ?? process.cwd(), raw)
}
