// Shared contract between engine and harness/herdr layers.
// ADR-0011: engine is domain-agnostic.
// ADR-0014: self-trigger model — no waitForAgentDone. Agents call hordr advance.

import type {RunState} from '../state/schema.js'

export interface WorktreeInfo {
  branch: string
  /** Filesystem path to the worktree checkout. Present when herdr supplies it. */
  path?: string
  workspaceId: string
}

export interface EngineDeps {
  createWorktree(beanId: string, opts?: {base?: string}): WorktreeInfo
  launchAgent(opts: {
    beanId: string
    cwd: string
    /** When set, send the prompt to this pane instead of creating a new tab. */
    existingPaneId?: string
    role: string
    workspaceId: string
  }): {paneLabel: string}
  paneExists(paneLabel: string): boolean
  removeWorktree(workspaceId: string): void
}

export interface StepResult {
  block?: boolean
  done: boolean
  runPatch?: Partial<RunState>
}
