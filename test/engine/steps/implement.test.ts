import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {implement} from '../../../src/engine/steps/implement.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {agent: 'implementer', kind: 'implement', optional: false} as StepConfig

describe('implement handler', () => {
  it('launches implementer, waits, returns done with panes', () => {
    let launched = false
    const deps = makeDeps({
      launchAgent(opts) {
        launched = true
        return {paneLabel: `hordr:${opts.beanId}:implementer`}
      },
    })

    const result = implement(makeRun(), step, deps)

    assert.isTrue(launched)
    expect(result.done).to.be.true
    expect(result.runPatch?.panes?.implementer).to.equal('hordr:hordr-test:implementer')
  })

  it('idempotent: reuses existing implementer pane when alive', () => {
    let launchCount = 0
    const deps = makeDeps({
      launchAgent() {
        launchCount++
        return {paneLabel: 'should-not-be-called'}
      },
      paneExists: () => true,
    })
    const run = makeRun({panes: {implementer: 'hordr:hordr-test:implementer'}})

    implement(run, step, deps)

    expect(launchCount).to.equal(0)
  })

  it('re-launches when existing pane is no longer alive', () => {
    let launchCount = 0
    const deps = makeDeps({
      launchAgent(opts) {
        launchCount++
        return {paneLabel: `hordr:${opts.beanId}:implementer`}
      },
      paneExists: () => false,
    })
    const run = makeRun({panes: {implementer: 'hordr:hordr-test:implementer'}})

    implement(run, step, deps)

    expect(launchCount).to.equal(1)
  })
})
