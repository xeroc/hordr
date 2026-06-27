import type {StepHandler} from './index.js'

import {launchOrReuse} from './shared.js'

// ADR-0011: generic agent step. Spawn the role-configured agent, wait for
// done-or-blocked (ADR-0013), advance or block accordingly.
export const agent: StepHandler = (run, step, deps) => {
  const role = step.agent
  if (!role) throw new Error('agent step: .agent field is required')

  const {label, panes} = launchOrReuse(run, role, deps)

  const status = deps.waitForAgentDone(label, 0)

  if (status === 'done') {
    return {done: true, runPatch: {panes}}
  }

  return {block: true, done: false, runPatch: {panes, status: 'blocked'}}
}
