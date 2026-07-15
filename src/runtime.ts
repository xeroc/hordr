/**
 * Production HordrDeps composition + test seam. With no engine, this is a
 * thin facade over herdr (worktree) + harness (agent launch) used by
 * `hordr run` and `hordr cleanup`.
 */
import {execFileSync} from 'node:child_process'
import process from 'node:process'

import {loadConfig} from './config/loader.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'
import {HerdrError, type WorktreeInfo} from './herdr/worktree.js'
import {branchFor, createWorktree, openWorktree, removeWorktree} from './herdr/worktree.js'

// git's phrasing when `worktree create` is asked to make a branch that already exists.
const ALREADY_EXISTS = /a branch named '([^']+)' already exists/i
// herdr's phrasing when `worktree open` can't find a worktree for the branch.
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

/** Current git runner (test-overridable via _setGitRunnerForTesting). */
export function getGitRunner(): GitRunner {
  return _gitRunner
}

/**
 * Check out `primary` and merge `branch` into it. Runs from `cwd` (the main
 * repo). Uses the mockable git runner so tests don't shell out. Throws
 * HerdrError on non-zero git exit.
 */
export function gitMergeBranch(primary: string, branch: string, cwd: string): void {
  _gitRunner(['checkout', primary], {cwd})
  _gitRunner(['merge', '--no-ff', branch], {cwd})
}

/** Map herdr's snake_case WorktreeInfo to hordr's camelCase deps contract. */
function worktreeToInfo(wt: WorktreeInfo): {branch: string; path?: string; workspaceId: string} {
  return {branch: wt.branch, path: wt.path, workspaceId: wt.workspace_id}
}

export interface HordrDeps {
  createWorktree(beanId: string, opts?: {base?: string}): {branch: string; path?: string; workspaceId: string}
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {paneLabel: string}
  removeWorktree(workspaceId: string): void
}

export function createDeps(): HordrDeps {
  return {
    createWorktree(beanId: string, opts?: {base?: string}): {branch: string; path?: string; workspaceId: string} {
      const config = loadConfig()
      const branch = branchFor(beanId)
      const base = opts?.base ?? config.primary_branch
      const cwd = process.cwd()

      try {
        return worktreeToInfo(createWorktree({base, branch, cwd}))
      } catch (error) {
        // Recovery only when herdr reports "a branch named '...' already exists".
        if (!(error instanceof HerdrError) || !ALREADY_EXISTS.test(error.message)) throw error
      }

      // Branch exists. Two shapes:
      //  (a) worktree linked → reuse via `worktree open`.
      //  (b) orphan branch → typical artefact of a prior failed create.
      //      Delete the branch and retry.
      try {
        return worktreeToInfo(openWorktree({branch, cwd}))
      } catch (openError) {
        if (!(openError instanceof HerdrError) || !WORKTREE_NOT_FOUND.test(openError.message)) throw openError
      }

      // ponytail: bean-id branches are hordr-owned; safe to delete when orphan.
      // `git branch -d` (not -D) refuses unmerged branches — natural safety net.
      _gitRunner(['branch', '-d', branch], {cwd})
      return worktreeToInfo(createWorktree({base, branch, cwd}))
    },

    launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {paneLabel: string} {
      return harnessLaunchAgent(opts)
    },

    removeWorktree(workspaceId: string): void {
      removeWorktree({workspaceId})
    },
  }
}

// --- test seam ---
let _override: HordrDeps | null = null

export function _setDepsForTesting(deps: HordrDeps | null): void {
  _override = deps
}

export function getDeps(): HordrDeps {
  return _override ?? createDeps()
}
