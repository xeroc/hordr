import type {RunState} from '../../state/schema.js'
import type {EngineDeps, StepResult} from '../types.js'

import {agent} from './agent.js'
import {hitl} from './hitl.js'

export type StepHandler = (run: RunState, step: StepConfig, deps: EngineDeps) => StepResult

// ADR-0011: workflow steps are either {agent: <role>} or {hitl: <flavor>}.
export interface StepConfig {
  agent?: string
  hitl?: 'approve' | 'external'
}

export {agent} from './agent.js'
export {hitl} from './hitl.js'
export {StepError} from './shared.js'
export {launchOrReuse} from './shared.js'

// Dispatch on step shape (ADR-0011).
export function dispatchStep(run: RunState, step: StepConfig, deps: EngineDeps): StepResult {
  if (step.agent) return agent(run, step, deps)
  if (step.hitl) return hitl(run, step, deps)
  throw new Error(`invalid step: must have .agent or .hitl — got ${JSON.stringify(step)}`)
}
