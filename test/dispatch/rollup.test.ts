import {expect} from 'chai'

import {areAllEpicsCompleted, isMilestoneComplete, rollup} from '../../src/dispatch/rollup.js'

// Each ancestor node: id + whether all its descendants are completed.
const ancestor = (id: string, done: boolean) => ({descendantsAllCompleted: done, id})

describe('dispatch/rollup', () => {
  it('marks all ancestors completed when every ancestor subtree is done', () => {
    const marked: string[] = []
    const result = rollup('hordr-task', {
      fetchAncestry: () => [ancestor('epic-1', true), ancestor('milestone-1', true)],
      markCompleted(id) {
        marked.push(id)
      },
    })

    expect(result).to.deep.equal(['epic-1', 'milestone-1'])
    expect(marked).to.deep.equal(['epic-1', 'milestone-1'])
  })

  it('stops at the first ancestor with open descendants', () => {
    const marked: string[] = []
    const result = rollup('hordr-task', {
      fetchAncestry: () => [ancestor('epic-1', true), ancestor('epic-2', false), ancestor('milestone-1', true)],
      markCompleted(id) {
        marked.push(id)
      },
    })

    // epic-1 completed, epic-2 has open descendants → stop, don't touch milestone
    expect(result).to.deep.equal(['epic-1'])
    expect(marked).to.deep.equal(['epic-1'])
  })

  it('marks nothing when the immediate parent has open descendants', () => {
    const result = rollup('hordr-task', {
      fetchAncestry: () => [ancestor('epic-1', false), ancestor('milestone-1', true)],
      markCompleted() {
        throw new Error('should not mark')
      },
    })

    expect(result).to.deep.equal([])
  })

  it('marks nothing when task has no ancestors', () => {
    const result = rollup('hordr-task', {
      fetchAncestry: () => [],
      markCompleted() {
        throw new Error('should not mark')
      },
    })

    expect(result).to.deep.equal([])
  })

  it('handles a single ancestor (milestone) completing', () => {
    const result = rollup('hordr-task', {
      fetchAncestry: () => [ancestor('milestone-1', true)],
      markCompleted() {},
    })

    expect(result).to.deep.equal(['milestone-1'])
  })

  describe('isMilestoneComplete', () => {
    it('returns true when milestone bean status is completed', () => {
      expect(isMilestoneComplete('hordr-ms1', {beanStatus: () => 'completed'})).to.be.true
    })

    it('returns false when milestone bean status is not completed', () => {
      expect(isMilestoneComplete('hordr-ms1', {beanStatus: () => 'in-progress'})).to.be.false
    })
  })

  describe('areAllEpicsCompleted', () => {
    it('returns true when all epic children are completed', () => {
      expect(
        areAllEpicsCompleted('hordr-ms1', {
          fetchEpicStatuses: () => [
            {id: 'epic-1', status: 'completed'},
            {id: 'epic-2', status: 'completed'},
          ],
        }),
      ).to.be.true
    })

    it('returns false when any epic is not completed', () => {
      expect(
        areAllEpicsCompleted('hordr-ms1', {
          fetchEpicStatuses: () => [
            {id: 'epic-1', status: 'completed'},
            {id: 'epic-2', status: 'in-progress'},
          ],
        }),
      ).to.be.false
    })

    it('returns false when milestone has no epics', () => {
      expect(areAllEpicsCompleted('hordr-ms1', {fetchEpicStatuses: () => []})).to.be.false
    })
  })
})
