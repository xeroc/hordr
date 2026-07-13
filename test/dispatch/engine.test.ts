/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'

import {createFleetEngine, type FleetEngine} from '../../src/dispatch/engine.js'

const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
  worktree_branch_prefix: 'bean/',
}

describe('dispatch/engine', () => {
  it('createFleetEngine returns an object with exactly 2 methods (scanFleet, advanceLane)', () => {
    const engine: FleetEngine = createFleetEngine(config, '/repo')

    const keys = Object.keys(engine).sort()
    expect(keys).to.deep.equal(['advanceLane', 'scanFleet'])
    expect(typeof engine.scanFleet).to.equal('function')
    expect(typeof engine.advanceLane).to.equal('function')
  })
})
