/* eslint-disable camelcase -- runPatch keys mirror RunState's snake_case JSON contract */
import type {StepHandler} from './index.js'

import {launchOrReuse} from './shared.js'

/**
 * Self-trigger model (ADR-0014), single-pane variant (hordr-khga):
 * - Spawn case (pane_step !== run.step): launch agent into the run's pane,
 *   mark pane_step = run.step, return done:false.
 * - Callback case (pane_step === run.step): the agent called advance from
 *   the same pane → done:true → bump step.
 *
 * The agent's persona says "when done, run: hordr advance <bean-id>".
 */
export const agent: StepHandler = (run, step, deps) => {
  const role = step.agent
  if (!role) throw new Error('agent step: .agent field is required')

  const {panes, paneStep} = launchOrReuse(run, role, deps)

  // Spawned (or respawned) → mark the pane as running this step, agent now active.
  if (paneStep !== undefined) {
    return {done: false, runPatch: {pane_step: paneStep, panes}}
  }

  // Pane reused with pane_step === run.step → agent's advance callback.
  return {done: true, runPatch: {panes}}
}
