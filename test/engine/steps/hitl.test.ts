import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {hitl} from '../../../src/engine/steps/hitl.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

describe('hitl handler', () => {
  it('approve flavor blocks with awaiting-approval status', () => {
    const step = {hitl: 'approve'} as StepConfig
    const run = makeRun({status: 'awaiting-approval'})

    const result = hitl(run, step, makeDeps())

    expect(result.done).to.be.false
    expect(result.block).to.be.true
    expect(result.runPatch?.status).to.equal('awaiting-approval')
  })

  it('external flavor blocks without changing status', () => {
    const step = {hitl: 'external'} as StepConfig
    const run = makeRun({status: 'pr-open'})

    const result = hitl(run, step, makeDeps())

    expect(result.done).to.be.false
    expect(result.block).to.be.true
    assert.isUndefined(result.runPatch, 'external flavor does not set runPatch')
  })
})
