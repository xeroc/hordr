/**
 * Fold rollup writes into the work commit via fixup + autosquash (ADR-0011).
 *
 * Three git operations, all cwd-scoped to the worktree:
 * 1. git add .beans/  (the ancestor status changes from rollup)
 * 2. git commit --fixup=<work-sha>  (create the fixup commit)
 * 3. git -c sequence.editor=: rebase -i --autosquash <work-sha>~1  (fold non-interactively)
 *
 * sequence.editor=: makes the interactive rebase non-interactive (the todo
 * list is auto-accepted), equivalent to GIT_SEQUENCE_EDITOR=true.
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

export interface SquashOpts {
  workCommitSha: string
  worktreePath: string
}

/** Squash the rollup changes into the work commit. Three git calls, all in the worktree. */
export function squashRollup(opts: SquashOpts, deps: {git: GitFn}): void {
  const {workCommitSha: sha, worktreePath: cwd} = opts
  deps.git(['add', '.beans/'], {cwd})
  deps.git(['commit', `--fixup=${sha}`], {cwd})
  deps.git(['-c', 'sequence.editor=:', 'rebase', '-i', '--autosquash', `${sha}~1`], {cwd})
}
