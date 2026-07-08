import {expect} from 'chai'

import {canTransition, type LaneStatus, VALID_TRANSITIONS} from '../../src/dispatch/lane.js'

describe('dispatch/lane', () => {
  describe('canTransition', () => {
    it('pending → active is valid', () => {
      expect(canTransition('pending', 'active')).to.be.true
    })

    it('active → merging is valid', () => {
      expect(canTransition('active', 'merging')).to.be.true
    })

    it('merging → done is valid (clean merge)', () => {
      expect(canTransition('merging', 'done')).to.be.true
    })

    it('merging → conflict is valid (merge conflict)', () => {
      expect(canTransition('merging', 'conflict')).to.be.true
    })

    it('conflict → done is valid (human resolved)', () => {
      expect(canTransition('conflict', 'done')).to.be.true
    })

    it('pending → merging is invalid (must go through active)', () => {
      expect(canTransition('pending', 'merging')).to.be.false
    })

    it('active → done is invalid (must merge first)', () => {
      expect(canTransition('active', 'done')).to.be.false
    })

    it('done → anything is invalid (terminal state)', () => {
      const statuses: LaneStatus[] = ['pending', 'active', 'merging', 'conflict', 'done']
      for (const to of statuses) {
        expect(canTransition('done', to)).to.be.false
      }
    })
  })

  describe('VALID_TRANSITIONS', () => {
    it('covers all 5 lane statuses', () => {
      expect(Object.keys(VALID_TRANSITIONS).sort()).to.deep.equal(['active', 'conflict', 'done', 'merging', 'pending'])
    })
  })
})
