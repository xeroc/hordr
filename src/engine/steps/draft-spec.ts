import type {StepHandler} from './index.js'

import {setStatus} from '../../beans/client.js'
import {DEFAULT_ROLE, launchOrReuse} from './shared.js'

export const draftSpec: StepHandler = (run, step, deps) => {
  const role = step.agent ?? DEFAULT_ROLE['draft-spec']!

  const {label, panes} = launchOrReuse(run, role, deps)

  // ponytail: timeout 0 = block until done (no timeout).
  deps.waitForAgentDone(label, 0)

  setStatus(run.bean, 'draft')

  return {
    done: true,
    runPatch: {panes, status: 'awaiting-approval'},
  }
}
