/**
 * Per-fleet serialized dispatch loop (ADR-0009, ADR-0010).
 *
 * The orchestrator that ties getDispatchable + resolveRole +
 * buildInvocationPrompt + spawnInvocation into one step. Pure function
 * with injected dependencies — the daemon wires the real I/O at call time.
 * One step = pick next task → spawn invocation. Waiting for /done and
 * rollup are separate concerns (the /done handler and the rollup module).
 */
import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'
import type {DispatchableBean} from './dispatch.js'

import {resolveRole} from './role.js'
import {buildInvocationPrompt} from './spawn.js'

export interface LaneContext {
  epicId: string
  paneId: string
  worktreePath: string
}

export interface DispatchDeps {
  fetchBean: (id: string) => BeanRecord
  fetchDispatchable: () => DispatchableBean[]
  spawn: (harness: string, prompt: string) => void
}

export interface DispatchOutcome {
  beanId: string
  dispatched: boolean
  role: string
}

/** Pick the next dispatchable task and spawn an invocation for it. */
export function dispatchNext(ctx: LaneContext, config: HordrConfig, deps: DispatchDeps): DispatchOutcome {
  const dispatchable = deps.fetchDispatchable()
  if (dispatchable.length === 0) return {beanId: '', dispatched: false, role: ''}

  const next = dispatchable[0]!
  const bean = deps.fetchBean(next.id)
  const {harness, persona, role} = resolveRole(bean, config)
  const prompt = buildInvocationPrompt({beanBody: bean.body, beanId: next.id, persona})
  deps.spawn(harness, prompt)

  return {beanId: next.id, dispatched: true, role}
}
