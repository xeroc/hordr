import type {RunState} from '../state/schema.js'
import type {EngineDeps} from './types.js'

import {loadConfig} from '../config/loader.js'
import {getRun, putRun} from '../state/run-store.js'
import {STEP_HANDLERS, type StepConfig, type StepHandler} from './steps/index.js'

export interface AdvanceResult {
  block?: boolean
  done: boolean
  terminal: boolean
}

// Idempotent single-step executor. Reads the run, dispatches to the current
// step's handler, persists the result. Safe to call repeatedly: handlers are
// check-then-act (see Child 2); re-entering a done step simply re-confirms and
// re-bumps the index (the caller sees done:true and stops).
//
// handlers is a test seam — production uses STEP_HANDLERS.
export function advance(
  beanId: string,
  deps: EngineDeps,
  handlers: Record<string, StepHandler> = STEP_HANDLERS,
): AdvanceResult {
  const run = getRun(beanId)
  if (!run) throw new Error(`advance: no run for bean ${beanId}`)

  // Terminal/idle states: nothing to execute.
  if (run.status === 'closed') return {done: true, terminal: true}
  if (run.status === 'awaiting-approval' || run.status === 'blocked' || run.status === 'pr-open') {
    return {block: true, done: false, terminal: false}
  }

  // Active states: planning, queued, running.
  const config = loadConfig()
  const workflow = config.workflows[run.workflow]
  if (!workflow) throw new Error(`advance: workflow "${run.workflow}" not found for bean ${beanId}`)

  // Defensive: step index past the workflow end without cleanup closing it.
  if (run.step >= workflow.steps.length) {
    putRun({...run, status: 'closed'})
    return {done: true, terminal: true}
  }

  const step = workflow.steps[run.step] as StepConfig
  const handler = handlers[step.kind]
  if (!handler) throw new Error(`advance: no handler for step kind "${step.kind}"`)

  const result = handler(run, step, deps)

  // Apply patch + bump step index in a single persist.
  const nextRun: RunState = {...run, ...result.runPatch}
  if (result.done && !result.block) {
    nextRun.step = run.step + 1
  }

  putRun(nextRun)

  return {
    block: result.block,
    done: result.done,
    terminal: nextRun.status === 'closed',
  }
}
