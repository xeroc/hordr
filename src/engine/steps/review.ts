import type {StepHandler} from './index.js'

import {DEFAULT_ROLE, launchOrReuse} from './shared.js'

export const review: StepHandler = (run, step, deps) => {
  const role = step.agent ?? DEFAULT_ROLE.review!

  // Optional step with no existing pane → skip entirely.
  if (step.optional && !run.panes[role]) {
    return {done: true}
  }

  const {label, panes} = launchOrReuse(run, role, deps)

  deps.waitForAgentDone(label, 0)

  return {done: true, runPatch: {panes}}
}
