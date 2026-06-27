import type {RunState} from '../state/schema.js'
import type {EngineDeps} from './types.js'

import {loadConfig} from '../config/loader.js'
import {getRun, putRun} from '../state/run-store.js'
import {dispatchStep, type StepConfig} from './steps/index.js'

export interface AdvanceResult {
  block?: boolean
  done: boolean
  terminal: boolean
}

// Idempotent single-step executor. Reads the run, dispatches on step shape
// (agent or hitl), persists the result.
export function advance(beanId: string, deps: EngineDeps): AdvanceResult {
  const run = getRun(beanId)
  if (!run) throw new Error(`advance: no run for bean ${beanId}`)

  if (run.status === 'closed') return {done: true, terminal: true}
  if (run.status === 'awaiting-approval' || run.status === 'blocked' || run.status === 'pr-open') {
    return {block: true, done: false, terminal: false}
  }

  const config = loadConfig()
  const workflow = config.workflows[run.workflow]
  if (!workflow) throw new Error(`advance: workflow "${run.workflow}" not found for bean ${beanId}`)

  if (run.step >= workflow.steps.length) {
    putRun({...run, status: 'closed'})
    return {done: true, terminal: true}
  }

  const step = workflow.steps[run.step] as StepConfig
  const result = dispatchStep(run, step, deps)

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
