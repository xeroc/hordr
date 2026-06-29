import type {RunState} from '../../state/schema.js'
import type {EngineDeps} from '../types.js'

// StepError lives here (not in index.ts) to avoid a runtime circular import.
export class StepError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StepError'
  }
}

export interface LaunchResult {
  label: string
  panes: RunState['panes']
  /**
   * Set only when launchOrReuse just spawned (or respawned) the pane.
   * Caller writes this into `run.pane_step` to mark "pane is running this step".
   * Undefined when the pane was reused as-is (advance callback case).
   */
  paneStep?: number
}

// Single-pane-per-run pattern: one pane per Run, reused across agent roles.
// Step transitions respawn the same pane id with a new prompt.
//
// Completion signal: if the stored pane exists AND pane_step === run.step,
// this is the agent's `hordr advance` callback for the current step (done).
// Otherwise, spawn fresh and mark pane_step = run.step.
export function launchOrReuse(run: RunState, role: string, deps: EngineDeps): LaunchResult {
  const stored = run.panes.primary

  if (stored && deps.paneExists(stored) && run.pane_step === run.step) {
    return {label: stored, panes: run.panes}
  }

  // ponytail: every agent step needs a worktree — without one, the agent
  // would launch in the project root (wrong) and herdr's workspace lookup
  // would fail. Fail loudly with a hint instead of letting herdr return
  // workspace_not_found.
  if (!run.worktree) {
    throw new StepError(`no worktree for bean ${run.bean} (workflow '${run.workflow}' must set worktree: true)`)
  }

  const workspaceId = run.worktree.workspace_id
  const cwd = run.worktree.path ?? workspaceId
  // If the stored pane is alive but pane_step is stale (workflow advanced to
  // a new role), reuse it — single-pane-per-run model. Only createTab when no
  // live pane exists.
  const existingPaneId = stored && deps.paneExists(stored) ? stored : undefined
  const pane = deps.launchAgent({
    beanId: run.bean,
    cwd,
    existingPaneId,
    role,
    workspaceId,
  })

  return {
    label: pane.paneLabel,
    panes: {...run.panes, primary: pane.paneLabel},
    paneStep: run.step,
  }
}
