import type {StepHandler} from './index.js'

// Both HITL flavors block: the transition OUT is driven by external commands
// (approve: hordr approve; external: hordr close-merged), not by this handler.
// advance() interprets {done:false, block:true} as "stop here and wait".
//
// approve flavor: ensure run is in awaiting-approval state so the approve CLI
//   can find it.
// external flavor: status is already pr-open (set by the pr step); just block.
export const hitl: StepHandler = (run, step) => {
  const flavor = step.flavor ?? 'approve'

  if (flavor === 'approve') {
    return {block: true, done: false, runPatch: {status: 'awaiting-approval'}}
  }

  return {block: true, done: false}
}
