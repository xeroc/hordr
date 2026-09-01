/**
 * VCS adapter contract (default_vcs).
 *
 * Hordr drives two version control systems through one semantic interface:
 * git (worktrees + branches, via herdr) and jj (colocated workspaces +
 * bookmarks). The engine, lifecycle, and commands speak ONLY these operations
 * — never raw git/jj argv. Each adapter keeps its mechanics internal:
 *
 *   git: branch-per-lane, 3-tier merge (ff-only → no-ff → leave in-progress
 *        for merger agent), staging-based commits.
 *   jj:  workspace-per-lane (`<name>@` head revsets), merge commits with
 *        first-class conflicts (never an in-progress state), snapshot-based
 *        working copies. Colocated repos only — git stays the remote/audit
 *        interface.
 *
 * All adapters follow the dispatch/ pattern: pure logic, injected shells,
 * mockable seams for tests.
 */

export type MergeOutcome =
  | {message: string; status: 'aborted'}
  | {status: 'conflict'}
  | {status: 'merged'}

export interface WorkspaceRef {
  /** On-disk working copy path (worktree or jj workspace dir). */
  path: string
  /** herdr workspace id owning the tabs for this working copy. */
  workspaceId: string
}

export interface Vcs {
  /**
   * Commit pending bookkeeping changes (the beans rollup). Idempotent:
   * returns false when there was nothing to commit. git: stage the beans dir
   * + commit (exactly the pre-adapter commitBeanChanges contract). jj:
   * commit the (auto-snapshotted) working-copy contents when non-empty and
   * undescribed.
   */
  commitPending(opts: {cwd: string; message: string}): boolean

  /**
   * Paths with unresolved conflicts at the working copy's head. Empty when
   * clean or when the probe fails. git: `git diff --name-only
   * --diff-filter=U`. jj: `jj resolve --list` (first column).
   */
  conflictedFiles(cwd: string): string[]

  /**
   * Create an isolated working copy named `name`, based on `base`.
   *
   * git: herdr worktree create (branch = name, base = branch/ref). Recovers
   *      from the branch-already-exists race by opening the existing worktree.
   * jj:  `jj workspace add <sibling-dir> --name <name> -r <base-revset>` +
   *      `herdr workspace create --cwd <dir>`. `base` resolves as a workspace
   *      name (`<base>@`) when a workspace by that name exists, else as a
   *      bookmark/revset. Tolerates re-creation: an existing workspace by
   *      that name is reused.
   */
  createWorkspace(opts: {base: string; cwd: string; name: string}): WorkspaceRef

  /**
   * Delete an integration ref (branch/bookmark). Safe no-op when absent;
   * git uses the safe `-d` (refuses unmerged).
   */
  deleteRef(opts: {cwd: string; name: string}): void

  /**
   * Delete an integration ref (branch/bookmark). Safe no-op when absent;
   * git uses the safe `-d` (refuses unmerged) unless `force` is set (`-D`,
   * for abort-style discard).
   */
  deleteRef(opts: {cwd: string; force?: boolean; name: string}): void

  /**
   * All uncommitted paths in the working copy at `cwd` (empty = clean).
   * Callers apply the beans-dir exclusion policy via {@link pathsOutside}.
   *
   * git: `git status --porcelain` parsed. jj: `jj diff --summary` (any jj
   * command snapshots the working copy first, so this captures in-flight
   * edits — never returns a stale answer, never loses work).
   */
  dirtyPaths(cwd: string): string[]

  /**
   * Post-resolution unwind after a merger agent settles an integration.
   * git: checkout back to the workspace's own branch. jj: advance the
   * `target` bookmark to the resolved head (when given) and leave an empty
   * working-copy commit.
   */
  finalizeIntegration(opts: {cwd: string; target?: string}): void

  /**
   * Locate an existing isolated working copy by name; null when absent (the
   * caller decides whether that's fatal). git: herdr worktree open by branch.
   * jj: `jj workspace list` name match.
   */
  findWorkspace(opts: {cwd: string; name: string}): null | {path: string; workspaceId?: string}

  /**
   * Merge the `source` lane's head into the integration line whose working
   * copy is `cwd`. For git, `target` is the branch checked out at cwd (the
   * 3-tier strategy runs there; conflict = merge left in-progress). For jj,
   * `target` is implied — cwd's working-copy head — and the merge is
   * `jj new @ <source>@` (conflict = conflicted head commit, never an
   * in-progress state).
   */
  integrateHead(opts: {cwd: string; message: string; source: string; target: string}): MergeOutcome

  /**
   * Whether a merger-agent-attended integration at `cwd` finished: resolved
   * and landed. git: source ref is an ancestor of target. jj: the head has
   * no conflicts and is a merge (>= 2 parents) — an abandoned merge collapses
   * to a single parent and reports unsettled.
   */

  /**
   * Clean-for-merge verdict: true when the only dirt is inside the beans dir
   * (ephemeral rollup status). FAIL-OPEN on probe failure — a broken
   * worktree must not stall the lane; the merge itself surfaces real
   * breakage (the pre-adapter worktreeClean policy). Contrast
   * dirtyPaths, which fails loud for acceptance gates.
   */
  isCleanIgnoringBeans(cwd: string): boolean
  isIntegrationSettled(opts: {cwd: string; source: string; target: string}): boolean

  readonly kind: 'git' | 'jj'

  /**
   * Merge the working copy head at `cwd` into integration ref `ref` (the
   * primary branch / bookmark). git: 3-tier merge with cwd = the main repo
   * (where the primary branch is checked out). jj: `jj new <ref> @` run in
   * the owning workspace, then the bookmark is moved to the merge — so cwd
   * is the SOURCE workspace for jj, the TARGET repo for git. Callers pick
   * cwd per kind.
   */
  mergeHeadIntoRef(opts: {cwd: string; message: string; ref: string; source: string}): MergeOutcome

  /**
   * Stable identity for the repo, shared by every worktree/workspace of one
   * clone and distinct across clones. git: `git rev-parse --git-common-dir`.
   * jj: `jj git root` (jj workspaces have no .git, so git rev-parse fails
   * there). Throws when the cwd is inside no repository.
   */
  projectKey(cwd: string): string

  /**
   * Tear down an isolated working copy. Tolerant of an already-gone state
   * (re-run after teardown must not fail). Closes the herdr workspace when a
   * workspaceId is given.
   *
   * git: `git worktree remove <path>` (never --force). jj: `jj workspace
   *      forget <name>` + delete the directory.
   */
  removeWorkspace(opts: {cwd: string; name: string; path: string; workspaceId?: string}): void
}

/**
 * Shared policy: filter `paths` down to those OUTSIDE `dir` (the beans dir).
 * Empty result = the only dirt is ephemeral beans status, which rollup owns.
 */
export function pathsOutside(dir: string, paths: string[]): string[] {
  const prefix = dir.replace(/\/+$/, '') + '/'
  return paths.filter((p) => !p.startsWith(prefix))
}
