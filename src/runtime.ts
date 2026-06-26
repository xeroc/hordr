/**
 * Production EngineDeps composition.
 *
 * Wires together the real implementations from src/herdr/* (worktree, pane,
 * wait), src/harness/* (launcher, test-signal), and src/beans/* (no-op here,
 * beans client is called directly by engine code). Commands import
 * `createEngineDeps()` and pass the result to engine functions.
 *
 * Test seam: `_setDepsForTesting(deps)` swaps the dep object for the duration
 * of a test. Commands should call `getDeps()` (not `createEngineDeps()`
 * directly) so the test override takes effect.
 */
import process from 'node:process'

import type {EngineDeps, WorktreeInfo} from './engine/types.js'

import {loadConfig} from './config/loader.js'
import {launchAgent as harnessLaunchAgent} from './harness/launcher.js'
import {detectTestSignal} from './harness/test-signal.js'
import {findPane, readPane} from './herdr/pane.js'
import {waitAgentStatus} from './herdr/wait.js'
import {branchFor, createWorktree, removeWorktree} from './herdr/worktree.js'

/**
 * Build a fresh EngineDeps bound to the current process environment.
 * Each call returns an independent object (no shared mutable state beyond
 * the underlying module-level seams in src/herdr/* and src/harness/*).
 */
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

    detectTestSignal(paneId: string): 'green' | 'red' | null {
      return detectTestSignal(paneId)
    },

    launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {
      paneLabel: string
    } {
      // Delegate to the harness launcher — it handles persona + bean context
      // internally. The cwd passed by the engine (the worktree path) flows
      // through to herdr pane split --cwd.
      return harnessLaunchAgent(opts)
    },

    paneExists(paneId: string): boolean {
      const ws = paneId.split(':')[0]
      return findPane(ws, paneId) !== null
    },

    readAgentOutput(paneId: string, lines?: number): string {
      return readPane({lines, paneId})
    },

    removeWorktree(workspaceId: string): void {
      removeWorktree({workspaceId})
    },

    waitForAgentDone(paneId: string, timeoutMs: number): void {
      waitAgentStatus({paneId, status: 'done', timeoutMs})
    },
  }
}

// --- test seam ---

let _override: EngineDeps | null = null

/**
 * Swap the dep object returned by `getDeps()`. Pass a full EngineDeps (use
 * STUB_DEPS as a base and override only what your test exercises). Pass `null`
 * to reset.
 */
export function _setDepsForTesting(deps: EngineDeps | null): void {
  _override = deps
}

/** Commands call this; tests can override via `_setDepsForTesting`. */
export function getDeps(): EngineDeps {
  return _override ?? createEngineDeps()
}
