/**
 * Production EngineDeps composition.
 */
import {execFileSync} from 'node:child_process'
import process from 'node:process'

import type {EngineDeps, WorktreeInfo} from './engine/types.js'

import {loadConfig} from './config/loader.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'
import {findPane} from './herdr/pane.js'
import {branchFor, createWorktree, HerdrError, openWorktree, removeWorktree} from './herdr/worktree.js'

// git's phrasing when `worktree create` is asked to make a branch that already exists.
const ALREADY_EXISTS = /a branch named '([^']+)' already exists/i
// herdr's phrasing when `worktree open` can't find a worktree for the branch
// (i.e. the branch exists but no worktree is linked to it — orphan branch).
const WORKTREE_NOT_FOUND = /worktree_not_found/i

/** Lazy git runner. Mockable for tests. Default shells out synchronously. */
export type GitRunner = (args: string[], opts: {cwd: string}) => void
const defaultGitRunner: GitRunner = (args, opts) => {
  try {
    execFileSync('git', ['-C', opts.cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const err = error as {stderr?: {toString(): string}}
    const stderr = err.stderr?.toString()?.trim() ?? ''
    throw new HerdrError(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`)
  }
}

let _gitRunner: GitRunner = defaultGitRunner

export function _setGitRunnerForTesting(fn: GitRunner): void {
  _gitRunner = fn
}

export function _resetGitRunner(): void {
  _gitRunner = defaultGitRunner
}

export function createEngineDeps(): EngineDeps {
  return {
    createWorktree(beanId: string, opts?: {base?: string}): WorktreeInfo {
      const config = loadConfig()
      const branch = branchFor(beanId, config.worktree_branch_prefix)
      const base = opts?.base ?? config.primary_branch
      const cwd = process.cwd()

      try {
        const wt = createWorktree({base, branch, cwd})
        return {branch: wt.branch, path: wt.path, workspaceId: wt.workspace_id}
      } catch (error) {
        // Recovery only when herdr reports "a branch named '...' already exists".
        if (!(error instanceof HerdrError) || !ALREADY_EXISTS.test(error.message)) throw error
      }

      // Branch exists. Two shapes:
      //  (a) worktree linked   → reuse via `worktree open`.
      //  (b) orphan branch     → typical artefact of a prior failed create
      //                          (git branch succeeded, worktree link never landed).
      //                          Delete the branch and retry.
      try {
        const wt = openWorktree({branch, cwd})
        return {branch: wt.branch, path: wt.path, workspaceId: wt.workspace_id}
      } catch (openError) {
        if (!(openError instanceof HerdrError) || !WORKTREE_NOT_FOUND.test(openError.message)) throw openError
      }

      // ponytail: bean/* branches are hordr-owned; safe to delete when orphan.
      // `git branch -d` (not -D) refuses unmerged branches — natural safety net
      // against losing real work. If it refuses, the git error propagates and
      // the user can investigate.
      _gitRunner(['branch', '-d', branch], {cwd})
      const wt = createWorktree({base, branch, cwd})
      return {branch: wt.branch, path: wt.path, workspaceId: wt.workspace_id}
    },

    launchAgent(opts: {beanId: string; cwd: string; existingPaneId?: string; role: string; workspaceId: string;}): {
      paneLabel: string
    } {
      return harnessLaunchAgent(opts)
    },

    paneExists(paneId: string): boolean {
      return findPane(paneId) !== null
    },

    removeWorktree(workspaceId: string): void {
      removeWorktree({workspaceId})
    },
  }
}

// --- test seam ---

let _override: EngineDeps | null = null

export function _setDepsForTesting(deps: EngineDeps | null): void {
  _override = deps
}

export function getDeps(): EngineDeps {
  return _override ?? createEngineDeps()
}
