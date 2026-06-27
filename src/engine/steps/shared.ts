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
}

// Common idempotency pattern for agent steps: reuse an existing live
// pane, or spawn a fresh one via deps. Returns the pane label and the
// updated panes map.
export function launchOrReuse(run: RunState, role: string, deps: EngineDeps): LaunchResult {
  const stored = run.panes[role]

  if (stored && deps.paneExists(stored)) {
    return {label: stored, panes: run.panes}
  }

  const workspaceId = run.worktree?.workspace_id ?? run.bean
  const cwd = run.worktree?.path ?? workspaceId
  const pane = deps.launchAgent({
    beanId: run.bean,
    cwd,
    role,
    workspaceId,
  })

  return {label: pane.paneLabel, panes: {...run.panes, [role]: pane.paneLabel}}
}
