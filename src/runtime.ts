/**
 * Production HordrDeps composition + test seam. With no engine, this is a
 * thin facade over the VCS adapter (workspaces) + harness (agent launch)
 * used by `hordr run` and `hordr cleanup`.
 */
import {execFileSync} from 'node:child_process'
import process from 'node:process'

import {loadConfig} from './config/loader.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'
import {HerdrError, removeWorktree} from './herdr/worktree.js'
import {getVcsOrMock} from './vcs/resolve.js'

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

export interface HordrDeps {
  createWorktree(beanId: string, opts?: {base?: string}): {branch: string; path?: string; workspaceId: string}
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {paneLabel: string}
  removeWorktree(workspaceId: string): void
}

export function createDeps(): HordrDeps {
  return {
    createWorktree(beanId: string, opts?: {base?: string}): {branch: string; path?: string; workspaceId: string} {
      const config = loadConfig()
      const base = opts?.base ?? config.primary_branch
      const ws = getVcsOrMock(config).createWorkspace({base, cwd: process.cwd(), name: beanId})
      return {branch: beanId, path: ws.path, workspaceId: ws.workspaceId}
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
