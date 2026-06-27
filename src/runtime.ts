/**
 * Production EngineDeps composition.
 * Commands call getDeps(); tests override via _setDepsForTesting.
 */
import process from 'node:process'

import type {EngineDeps, WorktreeInfo} from './engine/types.js'

import {loadConfig} from './config/loader.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'
import {findPane} from './herdr/pane.js'
import {waitAgentStatus} from './herdr/wait.js'
import {branchFor, createWorktree, removeWorktree} from './herdr/worktree.js'

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

    launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
      paneLabel: string
    } {
      return harnessLaunchAgent(opts)
    },

    paneExists(paneId: string): boolean {
      const ws = paneId.split(':')[0]
      return findPane(ws, paneId) !== null
    },

    removeWorktree(workspaceId: string): void {
      removeWorktree({workspaceId})
    },

    waitForAgentDone(paneId: string, timeoutMs: number): 'blocked' | 'done' {
      // ADR-0013: wait for done or blocked. Herdr's wait agent-status takes
      // one status, so we poll with short intervals until we see done/blocked
      // or the overall deadline expires.
      const deadline = Date.now() + timeoutMs
      const pollMs = Math.min(timeoutMs, 2000)

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now()
        const slice = Math.min(pollMs, remaining > 0 ? remaining : 1)
        try {
          waitAgentStatus({paneId, status: 'done', timeoutMs: slice})
          return 'done'
        } catch {
          // Not done yet — try blocked.
        }

        try {
          waitAgentStatus({paneId, status: 'blocked', timeoutMs: slice})
          return 'blocked'
        } catch {
          // Not blocked either — keep polling.
        }
      }

      // Timeout: treat as blocked (fail-safe).
      return 'blocked'
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
