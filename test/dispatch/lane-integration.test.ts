/* eslint-disable camelcase -- mock objects mirror snake_case config contracts */
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'

import {checkInvocation} from '../../src/dispatch/heal.js'
import {type DispatchDeps, dispatchNext, type LaneContext} from '../../src/dispatch/loop.js'
import {rollup} from '../../src/dispatch/rollup.js'
import {scanForNewLanes} from '../../src/dispatch/scan.js'

// Integration characterization test: the lane dispatch flow composes correctly.
// scan → dispatchNext → heal → rollup. The building blocks
// work together end-to-end with mock deps.

const config: HordrConfig = {
  agents: {
    implementer: {harness: 'opencode', persona: 'impl'},
    tester: {harness: 'claude', persona: 'test'},
  },
  primary_branch: 'develop',
}

describe('dispatch (lane flow integration)', () => {
  it('scan → dispatch → heal → rollup: the lane lifecycle composes', () => {
    // --- 1. Scan: find an unblocked epic without a lane ---
    const newLanes = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [{id: 'epic-1', title: 'Epic 1'}],
      hasReadyWork: () => true,
      laneExists: () => false,
    })
    expect(newLanes).to.have.length(1)
    expect(newLanes[0]!.id).to.equal('epic-1')

    // --- 2. Dispatch: spawn a task in the lane ---
    const laneCtx: LaneContext = {
      epicId: 'epic-1',
      paneId: 'w1:p1',
      worktreePath: '/wt/epic-1',
    }

    let spawnCalled = false
    const dispatchDeps: DispatchDeps = {
      fetchAncestorChain: () => [],
      fetchBean: (id) => ({assigned: 'implementer', body: `body of ${id}`, id}) as never,
      fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
      fetchDispatchable: () => [{assigned: 'implementer', id: 'task-1', priority: 'normal', title: 'T1', type: 'task'}],
      spawn() {
        spawnCalled = true
      },
    }

    const outcome = dispatchNext(laneCtx, config, dispatchDeps)
    expect(outcome.dispatched).to.be.true
    expect(outcome.beanId).to.equal('task-1')
    expect(spawnCalled).to.be.true

    // --- 3. Heal: task not done yet, pane alive → wait ---
    let healResult = checkInvocation(
      {paneId: 'w1:p1', taskId: 'task-1'},
      {beanStatus: () => 'in-progress', paneAlive: () => true},
    )
    expect(healResult.action).to.equal('wait')

    // --- 4. Heal: task completed → proceed (self-heal or /done) ---
    healResult = checkInvocation(
      {paneId: 'w1:p1', taskId: 'task-1'},
      {beanStatus: () => 'completed', paneAlive: () => true},
    )
    expect(healResult.action).to.equal('proceed')

    // --- 5. Rollup: walk ancestry, mark epic completed ---
    const marked = rollup('task-1', {
      fetchAncestry: () => [{descendantsAllCompleted: true, id: 'epic-1', status: 'todo'}],
      markCompleted() {},
    })
    expect(marked).to.deep.equal(['epic-1'])
  })

  it('multiple lanes scan independently (N parallel lanes)', () => {
    // Two epics are unblocked, one is blocked → two lanes created
    const newLanes = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [
        {id: 'epic-1', title: 'E1'},
        {id: 'epic-2', title: 'E2'},
        {id: 'epic-3', title: 'E3'},
      ],
      hasReadyWork: (id) => id !== 'epic-3', // epic-3 blocked
      laneExists: () => false,
    })

    expect(newLanes.map((e) => e.id)).to.deep.equal(['epic-1', 'epic-2'])
    // epic-3 stays pending — no worktree until it unblocks
  })

  it('crash recovery: pane gone + task not completed → blocked', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'task-1'},
      {beanStatus: () => 'in-progress', paneAlive: () => false},
    )
    expect(result.action).to.equal('blocked')
  })
})
