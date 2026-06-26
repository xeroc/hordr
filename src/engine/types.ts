// Shared contract between the workflow engine (hordr-1004) and the
// harness/herdr layers (hordr-1005 provides harness ops; hordr-1003 will
// provide herdr ops later). Step handlers consume EngineDeps; tests pass
// mocks. Concrete implementations are wired up by the CLI commands (hordr-1006).

import type {RunState} from '../state/schema.js'

export interface AgentPaneInfo {
  paneLabel: string
}

export interface WorktreeInfo {
  branch: string
  workspaceId: string
}

export interface EngineDeps {
  // Herdr operations — implemented by src/herdr/client.ts (hordr-1003, not yet built).
  createWorktree(beanId: string): WorktreeInfo
  detectTestSignal(paneLabel: string): 'green' | 'red' | null
  // Harness operations — implemented by src/harness/launcher.ts (hordr-1005).
  // launchAgent loads persona + bean context internally; callers pass primitives only.
  launchAgent(opts: {beanId: string; cwd: string; role: string; workspaceId: string;}): AgentPaneInfo
  paneExists(paneLabel: string): boolean

  readAgentOutput(paneLabel: string, lines?: number): string
  removeWorktree(workspaceId: string): void
  waitForAgentDone(paneLabel: string, timeoutMs: number): void
}

export interface StepResult {
  block?: boolean
  done: boolean
  runPatch?: Partial<RunState>
}

// Default implementation that throws on every call. Wired up by hordr-1006.
// Ponytail: avoids a "null dep" pattern with separate optional fields.
export const STUB_DEPS: EngineDeps = {
  createWorktree() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  detectTestSignal() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  launchAgent() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  paneExists() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  readAgentOutput() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  removeWorktree() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
  waitForAgentDone() {
    throw new Error('EngineDeps not wired (hordr-1006 pending)')
  },
}
