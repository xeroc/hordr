// Shared contract between engine and harness/herdr layers.
// ADR-0011: engine is domain-agnostic.
// ADR-0014: self-trigger model — no waitForAgentDone. Agents call hordr advance.

import type {RunState} from '../state/schema.js'

export interface WorktreeInfo {
  branch: string
  workspaceId: string
}

export interface EngineDeps {
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string}): {paneLabel: string}
  paneExists(paneLabel: string): boolean
  createWorktree(beanId: string): WorktreeInfo
  removeWorktree(workspaceId: string): void
}

export interface StepResult {
  block?: boolean
  done: boolean
  runPatch?: Partial<RunState>
}
