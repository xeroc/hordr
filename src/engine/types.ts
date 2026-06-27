// Shared contract between the workflow engine and the harness/herdr layers.
// Step handlers consume EngineDeps; tests pass mocks.
//
// ponytail: ADR-0011 — engine is domain-agnostic. No output parsing,
// no signal detection, no git/gh calls. The engine spawns agents,
// waits for status, and manages worktrees. That's it.

import type {RunState} from '../state/schema.js'

export interface WorktreeInfo {
  branch: string
  workspaceId: string
}

export interface AgentPaneInfo {
  paneLabel: string
}

export interface EngineDeps {
  // Worktree operations.
  createWorktree(beanId: string): WorktreeInfo
  // Agent operations.
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): AgentPaneInfo
  paneExists(paneLabel: string): boolean

  removeWorktree(workspaceId: string): void
  waitForAgentDone(paneLabel: string, timeoutMs: number): 'blocked' | 'done'
}

export interface StepResult {
  block?: boolean
  done: boolean
  runPatch?: Partial<RunState>
}

// Default implementation that throws on every call. Wired up by commands.
export const STUB_DEPS: EngineDeps = {
  createWorktree() {
    throw new Error('EngineDeps not wired')
  },
  launchAgent() {
    throw new Error('EngineDeps not wired')
  },
  paneExists() {
    throw new Error('EngineDeps not wired')
  },
  removeWorktree() {
    throw new Error('EngineDeps not wired')
  },
  waitForAgentDone() {
    throw new Error('EngineDeps not wired')
  },
}
