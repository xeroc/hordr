/**
 * git adapter — the historical behavior, unchanged, behind the Vcs contract.
 *
 * Lanes are git worktrees (branch = lane name) managed by herdr; merges use
 * the 3-tier strategy from src/dispatch/merge.ts; bookkeeping commits stage
 * the beans dir only (commitBeanChanges). All I/O goes through the existing
 * seams (herdr worktree shell, getGitRunner) so current tests keep passing
 * with mocks in place.
 */
import {execFileSync} from 'node:child_process'

import {resolveBeansDir} from '../beans/dir.js'
import {commitBeanChanges} from '../dispatch/commit-beans.js'
import {porcelainPaths} from '../dispatch/heal.js'
import {attemptMerge, restoreWorktree} from '../dispatch/merge.js'
import {closeWorkspace, createWorktree, HerdrError, openWorktree, removeWorktreeByPath} from '../herdr/worktree.js'
import {getGitRunner} from '../runtime.js'
import {resolveProjectKey} from '../storage/project.js'
import {type MergeOutcome, type Vcs, type WorkspaceRef} from './types.js'
import {pathsOutside} from './types.js'

/** git porcelain paths in `cwd`; sentinel on probe failure (fail loud). */
function gitDirtyPaths(cwd: string): string[] {
  try {
    return porcelainPaths(
      execFileSync('git', ['-C', cwd, 'status', '--porcelain'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}),
    )
  } catch {
    // Broken/missing worktree — gates must fail loud, not read as clean.
    return ['<vcs probe failed>']
  }
}

/**
 * Clean-for-merge = the only dirt is ephemeral beans status. FAIL-OPEN on
 * probe failure (broken worktree ≠ stall a healthy lane; the merge surfaces
 * real breakage) — the pre-adapter worktreeClean policy.
 */
function cleanIgnoringBeans(cwd: string): boolean {
  try {
    return pathsOutside(
      resolveBeansDir(cwd),
      porcelainPaths(execFileSync('git', ['-C', cwd, 'status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })),
    ).length === 0
  } catch {
    return true
  }
}

/** Void-returning GitFn over the shared (mockable) runner seam. */
function gitFn(args: string[], opts: {cwd: string}): void {
  getGitRunner()(args, opts)
}

/** Run a read-only git command and capture stdout; '' on non-zero exit. */
function gitRead(args: string[], cwd: string): string {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
  } catch {
    return ''
  }
}

export function createGitVcs(): Vcs {
  return {
    commitPending(opts: {cwd: string; message: string}): boolean {
      return commitBeanChanges({beansDir: resolveBeansDir(opts.cwd), cwd: opts.cwd}, {git: gitFn})
    },

    conflictedFiles(cwd: string): string[] {
      return gitRead(['diff', '--name-only', '--diff-filter=U'], cwd)
        .split('\n')
        .filter((l) => l.trim().length > 0)
    },

    createWorkspace(opts: {base: string; cwd: string; name: string}): WorkspaceRef {
      // herdr worktree create; recover from the branch-already-exists race by
      // opening (or recreating) — the engine's old createWorktreeWithRecovery.
      try {
        const wt = createWorktree({base: opts.base, branch: opts.name, cwd: opts.cwd})
        return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
      } catch (error) {
        if (!(error instanceof HerdrError) || !/already exists/i.test(error.message)) throw error
        try {
          const wt = openWorktree({branch: opts.name, cwd: opts.cwd})
          return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
        } catch (openError) {
          // Only the not-found race may fall through to delete-and-retry;
          // any other open failure re-throws (does not delete the branch).
          if (!(openError instanceof HerdrError) || !/worktree_not_found/i.test(openError.message)) throw openError
          getGitRunner()(['branch', '-d', opts.name], {cwd: opts.cwd})
          const wt = createWorktree({base: opts.base, branch: opts.name, cwd: opts.cwd})
          return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
        }
      }
    },

    currentRef(cwd: string): string {
      // '' on detached HEAD (exit 0, empty stdout) and outside any repo.
      return gitRead(['branch', '--show-current'], cwd).trim()
    },

    deleteRef(opts: {cwd: string; force?: boolean; name: string}): void {
      // -d (safe, NEVER -D) by default: git refuses unmerged branches —
      // natural net. force opts in to discard (abort path).
      getGitRunner()(['branch', opts.force ? '-D' : '-d', opts.name], {cwd: opts.cwd})
    },

    dirtyPaths: gitDirtyPaths,

    finalizeIntegration(opts: {cwd: string; target?: string}): void {
      // git has no bookmark to advance; the merge commit landed on checkout.
      restoreWorktree(opts.cwd, {git: gitFn})
    },

    findWorkspace(opts: {cwd: string; name: string}): null | {path: string; workspaceId?: string} {
      try {
        const wt = openWorktree({branch: opts.name, cwd: opts.cwd})
        return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
      } catch (error) {
        if (error instanceof HerdrError && /worktree_not_found/i.test(error.message)) return null
        throw error
      }
    },

    hasNewCommits(opts: {cwd: string; source: string}): boolean {
      // `merge-base --is-ancestor` speaks in exit codes: 0 = source fully
      // contained in HEAD (nothing to pull), non-zero = not (and the shared
      // runner throws on non-zero). Fail-open true on any probe failure —
      // the merge then surfaces the real error.
      try {
        getGitRunner()(['merge-base', '--is-ancestor', opts.source, 'HEAD'], {cwd: opts.cwd})
        return false
      } catch {
        return true
      }
    },

    integrateHead(opts: {cwd: string; message: string; source: string; target: string}): MergeOutcome {
      return attemptMerge({cwd: opts.cwd, source: opts.source, target: opts.target}, {
        git: gitFn,
        isClean: cleanIgnoringBeans,
      })
    },

    isCleanIgnoringBeans(cwd: string): boolean {
      return cleanIgnoringBeans(cwd)
    },

    isIntegrationSettled(opts: {cwd: string; source: string; target: string}): boolean {
      try {
        execFileSync(
          'git',
          ['-C', opts.cwd, 'merge-base', '--is-ancestor', opts.source, opts.target],
          {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
        )
        return true
      } catch {
        return false
      }
    },

    kind: 'git',

    mergeHeadIntoRef(opts: {cwd: string; message: string; ref: string; source: string}): MergeOutcome {
      // cwd = main repo (primary is checked out there) — the historical path.
      return attemptMerge({cwd: opts.cwd, source: opts.source, target: opts.ref}, {
        git: gitFn,
        isClean: cleanIgnoringBeans,
      })
    },

    projectKey(cwd: string): string {
      return resolveProjectKey({cwd})
    },

    removeWorkspace(opts: {cwd: string; name: string; path: string; workspaceId?: string}): void {
      removeWorktreeByPath(opts.path, {cwd: opts.cwd})
      if (opts.workspaceId) closeWorkspace(opts.workspaceId)
    },
  }
}
