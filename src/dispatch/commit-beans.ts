/**
 * Stage + commit beans-dir changes inside a worktree (ADR-0011 rollup).
 *
 * Idempotent: skips the commit when nothing is staged, so callers can invoke
 * defensively (e.g., immediately before worktree teardown) without knowing
 * whether rollup actually wrote anything this tick. Real git errors — index
 * lock, pre-commit hook abort, missing beans dir — propagate; only the
 * benign "nothing staged" case is absorbed.
 *
 * Pure function with an injected GitFn (matches the dispatch/ module pattern).
 * The daemon wires `getGitRunner()`; tests mock it.
 */
export type GitFn = (args: string[], opts: {cwd: string}) => void

export interface CommitBeansOpts {
  /** Beans data dir name (e.g., '.beans'), resolved from the worktree's config. */
  beansDir: string
  /** Worktree path to stage + commit in. */
  cwd: string
}

export interface CommitBeansDeps {
  git: GitFn
}

/**
 * Stage the beans dir, then commit if and only if something is staged.
 *
 * `git diff --cached --quiet` exits 0 when no staged diffs exist (skip
 * commit) and 1 when staged diffs exist (proceed to commit). Other non-zero
 * exits are real errors and propagate via the GitFn throw.
 *
 * Returns true if a commit was created, false if there was nothing to commit.
 */
export function commitBeanChanges(opts: CommitBeansOpts, deps: CommitBeansDeps): boolean {
  deps.git(['add', opts.beansDir], {cwd: opts.cwd})

  try {
    deps.git(['diff', '--cached', '--quiet'], {cwd: opts.cwd})
    return false // exit 0 = nothing staged → skip commit (idempotent)
  } catch {
    // exit 1 = something staged → fall through to commit
  }

  deps.git(['commit', '-m', 'chore(beans): rollup status changes'], {cwd: opts.cwd})
  return true
}
