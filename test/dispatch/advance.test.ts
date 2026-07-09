/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'
import type {LaneRow} from '../../src/storage/fleets.js'

import {advanceLane, type AdvanceLaneDeps} from '../../src/dispatch/advance.js'

const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
  worktree_branch_prefix: 'bean/',
}

const FLEET = {cwd: '/repo', milestoneBeanId: 'ms1', msBranch: 'ms/ms1', projectKey: 'pk1'}

function lane(overrides: Partial<LaneRow> = {}): LaneRow {
  return {
    branch: 'ms/ms1/epic-a',
    createdAt: '2026-01-01T00:00:00Z',
    currentTaskBeanId: null,
    epicBeanId: 'epic-a',
    fleetMilestoneBeanId: 'ms1',
    paneId: 'w1:p1',
    projectKey: 'pk1',
    status: 'active',
    worktreePath: '/wt/epic-a',
    ...overrides,
  }
}

interface DepsState {
  ancestry: Array<{descendantsAllCompleted: boolean; id: string}>
  bean: Record<string, {assigned?: string; body: string; id: string; type: string}>
  currentTask: null | string
  dispatchable: Array<{id: string; priority?: string; type?: string}>
  epicStatus: string
  markedCompleted: string[]
  mergeConflict: boolean
  merged: Array<{cwd: string; source: string; target: string}>
  removed: string[]
  spawnCalled: string[]
  status: string
}

function depsFor(state: DepsState): AdvanceLaneDeps {
  return {
    beanStatus: (id) => (id === state.currentTask ? 'completed' : 'in-progress'),
    epicStatus: () => state.epicStatus,
    fetchAncestry: () => state.ancestry,
    fetchBean: (id) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
    fetchDispatchable: (epicId) =>
      epicId === 'epic-a'
        ? state.dispatchable.map((d) => ({
            assigned: 'implementer',
            id: d.id,
            priority: d.priority ?? 'normal',
            title: 'T',
            type: d.type ?? 'task',
          }))
        : [],
    markCompleted(id) {
      state.markedCompleted.push(id)
    },
    mergeBranch(opts) {
      state.merged.push(opts)
      return {conflict: state.mergeConflict}
    },
    paneAlive: () => true,
    removeWorktree(branch) {
      state.removed.push(branch)
    },
    setLaneCurrentTask(_loc, taskId) {
      state.currentTask = taskId
    },
    spawn(opts) {
      state.spawnCalled.push(opts.prompt)
    },
    updateLaneStatus(_loc, status) {
      state.status = status
    },
  }
}

function freshState(overrides: Partial<DepsState> = {}): DepsState {
  return {
    ancestry: [],
    bean: {},
    currentTask: null,
    dispatchable: [],
    epicStatus: 'todo',
    markedCompleted: [],
    mergeConflict: false,
    merged: [],
    removed: [],
    spawnCalled: [],
    status: 'active',
    ...overrides,
  }
}

describe('dispatch/advance advanceLane', () => {
  it('idle + ready work → dispatches next task, sets currentTask', () => {
    const state = freshState({dispatchable: [{id: 'task-1'}]})
    const res = advanceLane({config, fleet: FLEET, lane: lane()}, depsFor(state))

    expect(res.action).to.equal('dispatched')
    expect(res.taskId).to.equal('task-1')
    expect(state.spawnCalled).to.have.length(1)
    expect(state.currentTask).to.equal('task-1')
  })

  it('idle + no ready work → idle (no spawn)', () => {
    const state = freshState({dispatchable: []})
    const res = advanceLane({config, fleet: FLEET, lane: lane()}, depsFor(state))
    expect(res.action).to.equal('idle')
    expect(state.spawnCalled).to.have.length(0)
  })

  it('active + task not done + pane alive → wait', () => {
    const state = freshState({currentTask: 'task-1'})
    const d = depsFor(state)
    d.beanStatus = () => 'in-progress'
    const res = advanceLane({config, fleet: FLEET, lane: lane({currentTaskBeanId: 'task-1'})}, d)
    expect(res.action).to.equal('wait')
  })

  it('active + pane gone + task not done → blocked, lane flips to conflict', () => {
    const state = freshState({currentTask: 'task-1'})
    const d = depsFor(state)
    d.beanStatus = () => 'in-progress'
    d.paneAlive = () => false
    const res = advanceLane({config, fleet: FLEET, lane: lane({currentTaskBeanId: 'task-1'})}, d)
    expect(res.action).to.equal('blocked')
    expect(state.status).to.equal('conflict')
  })

  it('proceed + epic NOT yet completed → rollup, free lane (currentTask cleared)', () => {
    const state = freshState({
      ancestry: [{descendantsAllCompleted: false, id: 'epic-a'}],
      currentTask: 'task-1',
      epicStatus: 'todo',
    })
    const res = advanceLane({config, fleet: FLEET, lane: lane({currentTaskBeanId: 'task-1'})}, depsFor(state))

    expect(res.action).to.equal('wait')
    expect(state.markedCompleted).to.deep.equal([]) // epic not completed → rollup stops before epic
    expect(state.currentTask).to.equal(null) // lane freed for next dispatch
    expect(state.merged).to.have.length(0) // no epic merge
  })

  it('proceed + epic completed → merge lane into ms, remove worktree, lane done', () => {
    const state = freshState({
      ancestry: [{descendantsAllCompleted: true, id: 'epic-a'}],
      currentTask: 'task-1',
      epicStatus: 'completed',
    })
    const res = advanceLane({config, fleet: FLEET, lane: lane({currentTaskBeanId: 'task-1'})}, depsFor(state))

    expect(res.action).to.equal('epic-completed')
    expect(state.markedCompleted).to.deep.equal(['epic-a'])
    expect(state.merged).to.deep.equal([{cwd: '/repo', source: 'ms/ms1/epic-a', target: 'ms/ms1'}])
    expect(state.removed).to.deep.equal(['ms/ms1/epic-a'])
    expect(state.status).to.equal('done')
    expect(state.currentTask).to.equal(null)
  })

  it('proceed + epic completed + merge conflict → lane conflict, worktree kept', () => {
    const state = freshState({
      ancestry: [{descendantsAllCompleted: true, id: 'epic-a'}],
      currentTask: 'task-1',
      epicStatus: 'completed',
      mergeConflict: true,
    })
    const res = advanceLane({config, fleet: FLEET, lane: lane({currentTaskBeanId: 'task-1'})}, depsFor(state))

    expect(res.action).to.equal('blocked')
    expect(state.status).to.equal('conflict')
    expect(state.removed).to.have.length(0) // worktree kept for human resolution
  })
})
