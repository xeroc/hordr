import type {StepHandler} from './index.js'

import {setStatus} from '../../beans/client.js'

export const cleanup: StepHandler = (run, _step, deps) => {
  setStatus(run.bean, 'completed')

  if (run.worktree) {
    deps.removeWorktree(run.worktree.workspace_id)
  }

  return {done: true, runPatch: {status: 'closed'}}
}
