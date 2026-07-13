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

import {logger} from '../logger.js'
import {type DependencyStatus, type DispatchableBean} from './dispatch.js'
import {checkInvocation} from './heal.js'
import {dispatchNext} from './loop.js'
import {rollup} from './rollup.js'

export type LaneAction = 'blocked' | 'dispatched' | 'epic-completed' | 'idle' | 'wait'

export interface AdvanceLaneDeps {
  // heal step
  beanStatus: (taskId: string) => string | undefined
  commitBeans: (worktreePath: string) => void
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
  epicStatus: (epicId: string) => string
  // dispatch step
  fetchAncestorChain: (id: string) => Array<{body: string; id: string; title: string; type: string}>
  // rollup
  fetchAncestry: (taskId: string) => Array<{descendantsAllCompleted: boolean; id: string; status: string}>
  fetchBean: (id: string) => BeanRecord
  fetchDependencyStatus: (id: string) => DependencyStatus
  fetchDispatchable: (epicId: string) => DispatchableBean[]
  markCompleted: (beanId: string) => void
  // epic-complete
  mergeBranch: (opts: {cwd: string; source: string; target: string}) => MergeResult
  paneAlive: (paneId: string) => boolean
  removeWorktree: (branch: string) => void
  setLaneCurrentTask: (loc: LaneLoc, taskId: null | string) => void
  setLanePane: (loc: LaneLoc, paneId: string) => void
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
      // the milestone branch.
      let epicStat = deps.epicStatus(opts.lane.epicBeanId)
      logger.debug(`lane, no dispatchable, epic status=${epicStat}`)

      // If epic is still not completed but has no dispatchable work, the children
      // may all be completed without rollup having propagated. Try a rollup sweep
      // on each completed child to propagate status upward.
      if (epicStat !== 'completed') {
        const children = deps.fetchAncestry(opts.lane.epicBeanId)
        let didMark = false
        for (const child of children) {
          if (child.status !== 'completed' && child.descendantsAllCompleted) {
            deps.markCompleted(child.id)
            didMark = true
            logger.debug(`lane ${opts.lane.epicBeanId}: rollup sweep marked ${child.id}`)
          }
        }

        if (didMark) {
          deps.commitBeans(opts.lane.worktreePath)
          // Re-check epic status after the sweep
          epicStat = deps.epicStatus(opts.lane.epicBeanId)
          logger.debug(`lane ${opts.lane.epicBeanId}: post-sweep epic status=${epicStat}`)
        }
      }

      if (epicStat === 'completed') {
        logger.info(
          `lane ${opts.lane.epicBeanId}: epic completed → merge ${opts.lane.branch} into ${opts.fleet.msBranch}`,
        )
        return mergeEpicLane(opts, deps, loc)
      }

      return {action: 'idle'}
    }

    // Pane might be gone (agent closed it, crash). Recreate if needed.
    let paneId = opts.lane.paneId ?? ''
    if (!paneId || !deps.paneAlive(paneId)) {
      paneId = deps.createPane({
        cwd: opts.lane.worktreePath,
        label: `hordr:${opts.lane.epicBeanId}`,
        workspaceId: opts.lane.workspaceId ?? '',
      })
      deps.setLanePane(loc, paneId)
      logger.info(`lane ${paneId}`)
    }

    const outcome = dispatchNext(
      {epicId: opts.lane.epicBeanId, paneId, worktreePath: opts.lane.worktreePath},
      opts.config,
      {
        fetchAncestorChain: deps.fetchAncestorChain,
        fetchBean: deps.fetchBean,
        fetchDependencyStatus: deps.fetchDependencyStatus,
        fetchDispatchable: () => dispatchable,
        spawn: (harness, prompt) => deps.spawn({harness, paneId, prompt}),
      },
    )
    if (!outcome.dispatched) return {action: 'idle'}

    deps.setLaneCurrentTask(loc, outcome.beanId)
    logger.info(`lane ${outcome.beanId} (role=${outcome.role})`)
    return {action: 'dispatched', taskId: outcome.beanId}
  }

  // --- active: heal the in-flight invocation ---
  const taskBeanId = opts.lane.currentTaskBeanId ?? ''
  const beanStat = deps.beanStatus(taskBeanId)
  const paneAlive = opts.lane.paneId ? deps.paneAlive(opts.lane.paneId) : false
  logger.info(
    `lane ${opts.lane.epicBeanId}: heal check — task=${taskBeanId} status=${beanStat ?? '?'} pane=${opts.lane.paneId ?? '(none)'} alive=${paneAlive}`,
  )

  const heal = checkInvocation(
    {paneId: opts.lane.paneId ?? '', taskId: taskBeanId},
    {beanStatus: deps.beanStatus, paneAlive: deps.paneAlive},
  )

  if (heal.action === 'wait') {
    logger.info(`lane ${opts.lane.epicBeanId}: waiting (task ${taskBeanId} still ${beanStat})`)
    return {action: 'wait'}
  }

  if (heal.action === 'blocked') {
    logger.warn(`lane ${opts.lane.epicBeanId}: BLOCKED — task ${taskBeanId} ${heal.reason}`)
    deps.updateLaneStatus(loc, 'conflict')
    return {action: 'blocked', taskId: taskBeanId}
  }

  // proceed: bean completed → roll up the ancestry.
  logger.info(`lane ${opts.lane.currentTaskBeanId} completed → rolling up`)
  const taskId = opts.lane.currentTaskBeanId
  let didMark = false
  for (;;) {
    const marked = rollup(taskId, {fetchAncestry: deps.fetchAncestry, markCompleted: deps.markCompleted})
    if (marked.length === 0) break
    didMark = true
    logger.debug(`lane ${marked.join(', ')}`)
  }

  // Commit the rollup's .beans changes so they survive the lane→ms merge.
  // Without this, `beans update -s completed` writes are uncommitted and lost.
  if (didMark) {
    deps.commitBeans(opts.lane.worktreePath)
  }

  // did the epic complete? → merge lane into ms/<id>, tear down, go done
  const epicStat = deps.epicStatus(opts.lane.epicBeanId)
  logger.debug(`lane epic status=${epicStat}`)
  if (epicStat === 'completed') {
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
  logger.debug(
    `lane ${opts.lane.epicBeanId}: merging ${opts.lane.branch} → ${opts.fleet.msBranch} (cwd=${opts.fleet.cwd})`,
  )
  const result = deps.mergeBranch({
    cwd: opts.fleet.cwd,
    source: opts.lane.branch,
    target: opts.fleet.msBranch,
  })
  if (result.conflict) {
    logger.error(`lane — needs human resolution`)
    deps.updateLaneStatus(loc, 'conflict')
    return {action: 'blocked', taskId}
  }

  logger.info(`lane, removing worktree, lane → done`)
  deps.removeWorktree(opts.lane.branch)
  deps.setLaneCurrentTask(loc, null)
  deps.updateLaneStatus(loc, 'done')
  return {action: 'epic-completed', taskId}
}
