/**
 * Per-lane dispatch-or-heal step (ADR-0010, ADR-0011, ADR-0014).
 *
 * advanceLane is the heart of the tick: for one lane, either dispatch the next
 * task (if idle) or advance the active invocation (heal → rollup → epic-merge).
 * Pure: every side effect (spawn, beans, git, store) is injected. Composed by
 * tick() over all active lanes.
 *
 * Lane status mapping for a blocked invocation (pane gone, task not done): the
 * lane flips to 'conflict' (human-needed, ADR-0014) and the tick stops advancing
 * it until a human restores it to 'active'.
 */
import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'
import type {LaneLoc, LaneRow} from '../storage/fleets.js'
import type {MergeResult} from './merge.js'

import {type DispatchableBean} from './dispatch.js'
import {checkInvocation} from './heal.js'
import {dispatchNext} from './loop.js'
import {rollup} from './rollup.js'

export type LaneAction = 'blocked' | 'dispatched' | 'epic-completed' | 'idle' | 'wait'

export interface AdvanceLaneDeps {
  // heal step
  beanStatus: (taskId: string) => string | undefined
  epicStatus: (epicId: string) => string
  // rollup
  fetchAncestry: (taskId: string) => Array<{descendantsAllCompleted: boolean; id: string; status: string}>
  fetchBean: (id: string) => BeanRecord
  // dispatch step
  fetchDispatchable: (epicId: string) => DispatchableBean[]
  markCompleted: (beanId: string) => void
  // epic-complete
  mergeBranch: (opts: {cwd: string; source: string; target: string}) => MergeResult
  paneAlive: (paneId: string) => boolean
  removeWorktree: (branch: string) => void
  setLaneCurrentTask: (loc: LaneLoc, taskId: null | string) => void
  spawn: (opts: {harness: string; paneId: string; prompt: string}) => void
  updateLaneStatus: (loc: LaneLoc, status: string) => void
}

export interface AdvanceLaneOpts {
  config: HordrConfig
  fleet: {cwd: string; milestoneBeanId: string; msBranch: string; projectKey: string}
  lane: LaneRow
}

export interface AdvanceLaneResult {
  action: LaneAction
  taskId?: string
}

/** Advance one lane by one step. */
export function advanceLane(opts: AdvanceLaneOpts, deps: AdvanceLaneDeps): AdvanceLaneResult {
  const loc: LaneLoc = {
    epicId: opts.lane.epicBeanId,
    milestoneId: opts.fleet.milestoneBeanId,
    projectKey: opts.fleet.projectKey,
  }

  // --- idle: dispatch the next task, or merge if epic is done ---
  if (!opts.lane.currentTaskBeanId) {
    const dispatchable = deps.fetchDispatchable(opts.lane.epicBeanId)
    if (dispatchable.length === 0) {
      // No more tasks to dispatch. If the epic is completed, merge it into
      // the milestone branch. This handles the case where the last task
      // completed on a previous tick (or a daemon restart) and the lane
      // went idle before the merge could run.
      if (deps.epicStatus(opts.lane.epicBeanId) === 'completed') {
        return mergeEpicLane(opts, deps, loc)
      }

      return {action: 'idle'}
    }

    const outcome = dispatchNext(
      {epicId: opts.lane.epicBeanId, paneId: opts.lane.paneId ?? '', worktreePath: opts.lane.worktreePath},
      opts.config,
      {
        fetchBean: deps.fetchBean,
        fetchDispatchable: () => dispatchable,
        spawn: (harness, prompt) => deps.spawn({harness, paneId: opts.lane.paneId ?? '', prompt}),
      },
    )
    if (!outcome.dispatched) return {action: 'idle'}

    deps.setLaneCurrentTask(loc, outcome.beanId)
    return {action: 'dispatched', taskId: outcome.beanId}
  }

  // --- active: heal the in-flight invocation ---
  const heal = checkInvocation(
    {paneId: opts.lane.paneId ?? '', taskId: opts.lane.currentTaskBeanId},
    {beanStatus: deps.beanStatus, paneAlive: deps.paneAlive},
  )

  if (heal.action === 'wait') return {action: 'wait'}
  if (heal.action === 'blocked') {
    deps.updateLaneStatus(loc, 'conflict')
    return {action: 'blocked', taskId: opts.lane.currentTaskBeanId}
  }

  // proceed: bean completed → roll up the ancestry.
  // Loop until stable: each pass may complete an ancestor whose parent's
  // subtree then becomes fully done. Re-queries see the fresh status.
  // Terminates when a pass marks nothing (all ancestors done or blocked).
  const taskId = opts.lane.currentTaskBeanId
  for (;;) {
    const marked = rollup(taskId, {fetchAncestry: deps.fetchAncestry, markCompleted: deps.markCompleted})
    if (marked.length === 0) break
  }

  // did the epic complete? → merge lane into ms/<id>, tear down, go done
  if (deps.epicStatus(opts.lane.epicBeanId) === 'completed') {
    return mergeEpicLane(opts, deps, loc, taskId)
  }

  // task done but epic still has work → free the lane for the next dispatch
  deps.setLaneCurrentTask(loc, null)
  return {action: 'wait', taskId}
}

/**
 * Merge an epic's lane into the milestone integration branch, tear down the
 * worktree, and mark the lane done. Shared by the idle-merge and active-merge
 * paths. On conflict: lane flips to 'conflict', worktree kept for human.
 */
function mergeEpicLane(opts: AdvanceLaneOpts, deps: AdvanceLaneDeps, loc: LaneLoc, taskId?: string): AdvanceLaneResult {
  const result = deps.mergeBranch({
    cwd: opts.fleet.cwd,
    source: opts.lane.branch,
    target: opts.fleet.msBranch,
  })
  if (result.conflict) {
    deps.updateLaneStatus(loc, 'conflict')
    return {action: 'blocked', taskId}
  }

  deps.removeWorktree(opts.lane.branch)
  deps.setLaneCurrentTask(loc, null)
  deps.updateLaneStatus(loc, 'done')
  return {action: 'epic-completed', taskId}
}
