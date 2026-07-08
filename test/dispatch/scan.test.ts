import {expect} from 'chai'

import {scanForNewLanes} from '../../src/dispatch/scan.js'

const epic = (id: string) => ({id, title: `Epic ${id}`})

describe('dispatch/scan', () => {
  it('returns epics that have ready work AND no existing lane', () => {
    const result = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [epic('epic-1'), epic('epic-2'), epic('epic-3')],
      hasReadyWork: (id) => id === 'epic-1' || id === 'epic-3',
      laneExists: (id) => id === 'epic-3', // epic-3 already has a lane
    })

    expect(result.map((e) => e.id)).to.deep.equal(['epic-1'])
  })

  it('returns empty when all epics are blocked (no ready work)', () => {
    const result = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [epic('epic-1'), epic('epic-2')],
      hasReadyWork: () => false,
      laneExists: () => false,
    })

    expect(result).to.have.length(0)
  })

  it('returns empty when all ready epics already have lanes', () => {
    const result = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [epic('epic-1')],
      hasReadyWork: () => true,
      laneExists: () => true,
    })

    expect(result).to.have.length(0)
  })

  it('returns empty when milestone has no epics', () => {
    const result = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [],
      hasReadyWork: () => true,
      laneExists: () => false,
    })

    expect(result).to.have.length(0)
  })

  it('returns multiple epics when several are newly unblocked', () => {
    const result = scanForNewLanes('hordr-ms1', {
      fetchEpics: () => [epic('epic-1'), epic('epic-2'), epic('epic-3')],
      hasReadyWork: () => true,
      laneExists: () => false,
    })

    expect(result.map((e) => e.id)).to.deep.equal(['epic-1', 'epic-2', 'epic-3'])
  })
})
