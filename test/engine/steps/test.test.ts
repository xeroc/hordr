import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {testStep} from '../../../src/engine/steps/test.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {agent: 'tester', kind: 'test', optional: false} as StepConfig

describe('test handler', () => {
  it('green signal → done', () => {
    const deps = makeDeps({detectTestSignal: () => 'green'})

    const result = testStep(makeRun(), step, deps)

    expect(result.done).to.be.true
    assert.isUndefined(result.block)
  })

  it('red signal → block with status blocked', () => {
    const deps = makeDeps({detectTestSignal: () => 'red'})

    const result = testStep(makeRun({status: 'running'}), step, deps)

    expect(result.done).to.be.false
    expect(result.block).to.be.true
    expect(result.runPatch?.status).to.equal('blocked')
  })

  it('null signal → block (fail-safe)', () => {
    const deps = makeDeps({detectTestSignal: () => null})

    const result = testStep(makeRun({status: 'running'}), step, deps)

    expect(result.done).to.be.false
    expect(result.block).to.be.true
    expect(result.runPatch?.status).to.equal('blocked')
  })

  it('stores tester pane label in runPatch', () => {
    const deps = makeDeps({detectTestSignal: () => 'green'})

    const result = testStep(makeRun(), step, deps)

    expect(result.runPatch?.panes?.tester).to.exist
  })
})
