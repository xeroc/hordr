import type {StepHandler} from './index.js'

import {launchOrReuse} from './shared.js'

/**
 * Self-trigger model (ADR-0014):
 * - First call (no pane exists for role): spawn the agent → {done: false}
 * - Second call (pane exists = agent called advance): {done: true} → bump step
 *
 * The agent's persona says "when done, run: hordr advance <bean-id>".
 * That call IS the completion signal — no waitForAgentDone, no polling.
 */
export const agent: StepHandler = (run, step, deps) => {
  const role = step.agent
  if (!role) throw new Error('agent step: .agent field is required')

  const {label, panes} = launchOrReuse(run, role, deps)

  // If we just spawned (pane wasn't stored before), the agent is now running.
  // Return done:false — advance will NOT bump the step. The agent will call
  // advance again when it's finished.
  if (!run.panes[role]) {
    return {done: false, runPatch: {panes}}
  }

  // Pane was already stored — this is the "agent called advance" callback.
  // The agent is done. Bump the step.
  return {done: true, runPatch: {panes}}
}
