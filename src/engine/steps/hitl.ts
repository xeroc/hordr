import type {StepHandler} from './index.js'

// Both HITL flavors block: the transition OUT is driven by external commands
// (approve: hordr approve; external: hordr close-merged), not by this handler.
export const hitl: StepHandler = (run, step) => {
  const flavor = step.hitl ?? 'approve'

  if (flavor === 'approve') {
    return {block: true, done: false, runPatch: {status: 'awaiting-approval'}}
  }

  return {block: true, done: false}
}
