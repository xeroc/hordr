/**
 * Production EngineDeps composition.
 */
import process from 'node:process'

import type {EngineDeps, WorktreeInfo} from './engine/types.js'

import {loadConfig} from './config/loader.js'
import {branchFor, createWorktree, removeWorktree} from './herdr/worktree.js'
import {findPane} from './herdr/pane.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'

export function createEngineDeps(): EngineDeps {
  return {
    createWorktree(beanId: string): WorktreeInfo {
      const config = loadConfig()
      const branch = branchFor(beanId, config.worktree_branch_prefix)
      const wt = createWorktree({
        base: config.primary_branch,
        branch,
        cwd: process.cwd(),
      })
      return {branch: wt.branch, workspaceId: wt.workspace_id}
    },

    removeWorktree(workspaceId: string): void {
      removeWorktree({workspaceId})
    },

    paneExists(paneId: string): boolean {
      return findPane(paneId) !== null
    },

    launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
      paneLabel: string
    } {
      return harnessLaunchAgent(opts)
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
