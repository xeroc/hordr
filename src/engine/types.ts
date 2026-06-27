// Shared contract between engine and harness/herdr layers.
// ADR-0011: engine is domain-agnostic.

import type {RunState} from '../state/schema.js'

export interface WorktreeInfo {
  branch: string
  workspaceId: string
}

export interface EngineDeps {
  createWorktree(beanId: string): WorktreeInfo
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {paneLabel: string}
  paneExists(paneLabel: string): boolean
  removeWorktree(workspaceId: string): void
  waitForAgentDone(paneLabel: string, timeoutMs: number): 'blocked' | 'done'
}

export interface StepResult {
  block?: boolean
  done: boolean
  runPatch?: Partial<RunState>
}
