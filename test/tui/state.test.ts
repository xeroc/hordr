import {expect} from 'chai'

import type {FleetRow, LaneRow} from '../../src/storage/fleets.js'

import {moveCursor, statusRank, toFleetList} from '../../src/tui/state.js'

const fleet = (over: Partial<FleetRow> = {}): FleetRow => ({
  branch: 'ms/x',
  createdAt: '',
  milestoneBeanId: 'ms-1',
  projectKey: 'pk',
  status: 'active',
  worktreePath: '/wt',
  ...over,
})

const lane = (over: Partial<LaneRow> = {}): LaneRow => ({
  branch: 'e',
  createdAt: '',
  currentTaskBeanId: null,
  epicBeanId: 'e-1',
  fleetMilestoneBeanId: 'ms-1',
  paneId: null,
  projectKey: 'pk',
  status: 'active',
  workspaceId: null,
  worktreePath: '/wt',
  ...over,
})

describe('tui/state', () => {
  it('toFleetList maps fleets with per-fleet lane counts', () => {
    const fleets = [fleet({milestoneBeanId: 'ms-1'}), fleet({milestoneBeanId: 'ms-2'})]
    const lanes = [
      lane({fleetMilestoneBeanId: 'ms-1'}),
      lane({epicBeanId: 'e-2', fleetMilestoneBeanId: 'ms-1'}),
      lane({fleetMilestoneBeanId: 'ms-2'}),
    ]

    const items = toFleetList(fleets, lanes)
    expect(items.map((i) => i.milestone)).to.deep.equal(['ms-1', 'ms-2'])
    expect(items[0]!.laneCount).to.equal(2)
    expect(items[1]!.laneCount).to.equal(1)
  })

  it('toFleetList sorts in-flight before broken before done', () => {
    const fleets = [
      fleet({milestoneBeanId: 'done-ms', status: 'done'}),
      fleet({milestoneBeanId: 'act-ms', status: 'active'}),
      fleet({milestoneBeanId: 'brk-ms', status: 'broken'}),
    ]

    const items = toFleetList(fleets, [])
    expect(items.map((i) => i.milestone)).to.deep.equal(['act-ms', 'brk-ms', 'done-ms'])
  })

  it('statusRank orders active < merging < broken < done', () => {
    expect(statusRank('active')).to.be.below(statusRank('merging'))
    expect(statusRank('merging')).to.be.below(statusRank('broken'))
    expect(statusRank('broken')).to.be.below(statusRank('done'))
  })

  it('moveCursor clamps within bounds and returns -1 for an empty list', () => {
    expect(moveCursor(2, 5, -1)).to.equal(1)
    expect(moveCursor(0, 5, -1)).to.equal(0) // clamp at top
    expect(moveCursor(4, 5, 1)).to.equal(4) // clamp at bottom
    expect(moveCursor(-1, 0, 1)).to.equal(-1) // empty list
  })
})
