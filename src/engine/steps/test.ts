import type {StepHandler} from './index.js'

import {DEFAULT_ROLE, launchOrReuse} from './shared.js'

export const testStep: StepHandler = (run, step, deps) => {
  const role = step.agent ?? DEFAULT_ROLE.test!

  const {label, panes} = launchOrReuse(run, role, deps)

  deps.waitForAgentDone(label, 0)

  const signal = deps.detectTestSignal(label)

  // Fail-safe: null signal treated as red (SPEC §4 test step).
  if (signal === 'green') {
    return {done: true, runPatch: {panes}}
  }

  return {block: true, done: false, runPatch: {panes, status: 'blocked'}}
}
