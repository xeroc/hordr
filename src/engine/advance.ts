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

/**
 * Idempotent single-step executor. Self-trigger model (ADR-0014):
 * the agent calls `hordr advance <bean>` when done. No supervisor, no polling.
 *
 * After a step completes (done && !block), advance bumps the step index and
 * recurses to execute the next step immediately. This means a single advance
 * call can spawn the next agent in the same call (the caller is the previous
 * agent saying "I'm done, start the next").
 */
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
    // Step done — bump and recurse to execute the next step.
    nextRun.step = run.step + 1
    putRun(nextRun)

    // If more steps remain, execute the next one now (spawn the next agent).
    if (nextRun.step < workflow.steps.length) {
      return advance(beanId, deps)
    }

    // No more steps — terminal.
    putRun({...nextRun, status: 'closed'})
    return {done: true, terminal: true}
  }

  // Not done or blocked — persist and return.
  putRun(nextRun)

  return {
    block: result.block,
    done: result.done,
    terminal: nextRun.status === 'closed',
  }
}
