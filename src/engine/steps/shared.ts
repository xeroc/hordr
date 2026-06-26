import type {RunState} from '../../state/schema.js'
import type {EngineDeps} from '../types.js'

// StepError lives here (not in index.ts) to avoid a runtime circular import:
// index.ts imports handlers, handlers import StepError. Keeping StepError in
// shared.ts breaks the cycle while index.ts re-exports it for callers.
export class StepError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StepError'
  }
}

// SPEC §4 default agent roles per step kind (used when step.agent is absent).
export const DEFAULT_ROLE: Record<string, string> = {
  'draft-spec': 'planner',
  implement: 'implementer',
  pr: 'open_pr',
  review: 'reviewer',
  test: 'tester',
}

export interface LaunchResult {
  label: string
  panes: RunState['panes']
}

// Common idempotency pattern for agent-bearing steps: reuse an existing live
// pane by label, or spawn a fresh one via deps. Returns the pane label and the
// updated panes map. Callers persist the panes via runPatch.
//
// ponytail: workspace_id is used as both the herdr workspace id and the cwd
// for the harness. hordr-1006 wires real worktree path resolution; tests pass
// temp dirs as workspace_id.
export function launchOrReuse(run: RunState, role: string, deps: EngineDeps): LaunchResult {
  const stored = run.panes[role]

  if (stored && deps.paneExists(stored)) {
    return {label: stored, panes: run.panes}
  }

  const workspaceId = run.worktree?.workspace_id ?? run.bean
  const pane = deps.launchAgent({
    beanId: run.bean,
    cwd: workspaceId,
    role,
    workspaceId,
  })

  return {label: pane.paneLabel, panes: {...run.panes, [role]: pane.paneLabel}}
}
