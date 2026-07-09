import {expect} from 'chai'

import type {LaneRow} from '../../src/storage/fleets.js'

import {createLaneForEpic, laneBranchName} from '../../src/dispatch/lane-create.js'

describe('dispatch/lane-create createLaneForEpic', () => {
  it('creates a worktree from ms/<id>, a pane, and an active lane row', () => {
    const wtCalls: Array<{base: string; branch: string; cwd: string}> = []
    const paneCalls: Array<{cwd: string; label: string; workspaceId: string}> = []
    let added: LaneRow | undefined

    const res = createLaneForEpic(
      {cwd: '/repo', epic: {id: 'epic-1'}, fleet: {milestoneBeanId: 'ms1', msBranch: 'ms/ms1', projectKey: 'pk1'}},
      {
        addLane(row) {
          added = row
        },
        createPane(opts) {
          paneCalls.push(opts)
          return 'w1:p1'
        },
        createWorktree(opts) {
          wtCalls.push(opts)
          return {path: '/wt/epic-1', workspaceId: 'w1'}
        },
      },
    )

    // worktree branched from the milestone integration branch
    expect(wtCalls).to.have.length(1)
    expect(wtCalls[0]).to.deep.equal({base: 'ms/ms1', branch: 'ms/ms1/epic-1', cwd: '/repo'})
    // pane created in the worktree
    expect(paneCalls).to.deep.equal([{cwd: '/wt/epic-1', label: 'hordr:epic-1', workspaceId: 'w1'}])
    // lane row persisted active
    expect(added).to.include({
      branch: 'ms/ms1/epic-1',
      currentTaskBeanId: null,
      epicBeanId: 'epic-1',
      fleetMilestoneBeanId: 'ms1',
      paneId: 'w1:p1',
      projectKey: 'pk1',
      status: 'active',
      worktreePath: '/wt/epic-1',
    })
    expect(res).to.deep.equal({branch: 'ms/ms1/epic-1', paneId: 'w1:p1', worktreePath: '/wt/epic-1'})
  })

  it('falls back to workspaceId as worktreePath when path is absent', () => {
    const res = createLaneForEpic(
      {cwd: '/repo', epic: {id: 'epic-2'}, fleet: {milestoneBeanId: 'ms1', msBranch: 'ms/ms1', projectKey: 'pk1'}},
      {
        addLane() {},
        createPane: () => 'p',
        createWorktree: () => ({workspaceId: 'wOnly'}),
      },
    )
    expect(res.worktreePath).to.equal('wOnly')
  })

  it('laneBranchName composes ms/<ms-id>/<epic-id>', () => {
    expect(laneBranchName('ms/hordr-ms1', 'epic-a')).to.equal('ms/hordr-ms1/epic-a')
  })
})
