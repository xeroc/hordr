/**
 * In-place lane continuation (hordr-thjh).
 *
 * When the agent calls `hordr done <task>`, the daemon runs continueLane to
 * find the next dispatchable bean in the lane's epic and return it to the
 * LIVE agent — no send-keys spawn. The agent adopts the next bean's
 * persona/role and keeps working in the same session.
 *
 * The tick's heal-completed path yields to /done: if the pane is alive, the
 * tick waits (doesn't free the lane); /done owns sequential dispatch.
 *
 * Pure: all I/O (rollup, dispatchable query, DB write) is in deps.
 */
import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'
import type {LaneLoc} from '../storage/fleets.js'
import type {DependencyStatus, DispatchableBean} from './dispatch.js'
import type {AncestorContext} from './spawn.js'

import {resolveRole} from './role.js'
import {buildInvocationPrompt} from './spawn.js'

export interface ContinueLaneInfo {
  epicId: string
  loc: LaneLoc
}

export interface NextBean {
  id: string
  prompt: string
  role: string
}

export interface ContinueResult {
  next: NextBean | null
  reason: string
}

export interface ContinueDeps {
  config: HordrConfig
  fetchAncestorChain: (id: string) => AncestorContext[]
  fetchBean: (id: string) => BeanRecord
  fetchDependencyStatus: (id: string) => DependencyStatus
  findLane: (taskId: string) => ContinueLaneInfo | null
  getDispatchable: (epicId: string) => DispatchableBean[]
  /** Full rollup loop + commitBeans for the completed task's ancestors. */
  rollup: (taskId: string) => void
  setCurrentTask: (loc: LaneLoc, beanId: null | string) => void
}

/**
 * After /done verifies a task, find and claim the next bean in the lane.
 * Returns the next bean's context (prompt, role) for the agent to adopt,
 * or null if the agent should stop (no work, harness mismatch, no lane).
 *
 * Side effects: rollup(taskId), setCurrentTask(loc, nextId|null).
 */
export function continueLane(taskId: string, deps: ContinueDeps): ContinueResult {
  const lane = deps.findLane(taskId)
  if (lane === null) return {next: null, reason: 'no lane owns this task (idempotent)'}

  deps.rollup(taskId)

  const dispatchable = deps.getDispatchable(lane.epicId)
  if (dispatchable.length === 0) {
    deps.setCurrentTask(lane.loc, null)
    return {next: null, reason: 'no dispatchable beans in epic — lane idle'}
  }

  const nextId = dispatchable[0]!.id
  const currentRole = resolveRole(deps.fetchBean(taskId), deps.config)
  const nextRole = resolveRole(deps.fetchBean(nextId), deps.config)

  if (nextRole.harness !== currentRole.harness) {
    deps.setCurrentTask(lane.loc, null)
    return {
      next: null,
      reason: `harness mismatch: ${currentRole.harness} → ${nextRole.harness} — tick cold-starts`,
    }
  }

  const bean = deps.fetchBean(nextId)
  const ancestors = deps.fetchAncestorChain(nextId)
  const dependencies = deps.fetchDependencyStatus(nextId)
  const prompt = buildInvocationPrompt({
    ancestors,
    beanBody: bean.body ?? '',
    beanId: nextId,
    dependencies,
    persona: nextRole.persona,
    role: nextRole.role,
  })

  deps.setCurrentTask(lane.loc, nextId)

  return {
    next: {id: nextId, prompt, role: nextRole.role},
    reason: `continuing with ${nextId} (${nextRole.role})`,
  }
}
