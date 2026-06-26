import type {StepHandler} from './index.js'

import {DEFAULT_ROLE, launchOrReuse} from './shared.js'

export const implement: StepHandler = (run, step, deps) => {
  const role = step.agent ?? DEFAULT_ROLE.implement!

  const {label, panes} = launchOrReuse(run, role, deps)

  deps.waitForAgentDone(label, 0)

  return {done: true, runPatch: {panes}}
}
