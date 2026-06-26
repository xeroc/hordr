import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {review} from '../../../src/engine/steps/review.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

describe('review handler', () => {
  it('optional step with no existing pane → skip', () => {
    const step = {agent: 'reviewer', kind: 'review', optional: true} as StepConfig
    let launched = false
    const deps = makeDeps({
      launchAgent() {
        launched = true
        return {paneLabel: 'x'}
      },
    })

    const result = review(makeRun(), step, deps)

    assert.isFalse(launched)
    expect(result.done).to.be.true
    assert.isUndefined(result.runPatch, 'skip does not modify panes')
  })

  it('non-optional step → launches reviewer and waits', () => {
    const step = {agent: 'reviewer', kind: 'review', optional: false} as StepConfig
    let launched = false
    const deps = makeDeps({
      launchAgent(opts) {
        launched = true
        return {paneLabel: `hordr:${opts.beanId}:reviewer`}
      },
    })

    const result = review(makeRun(), step, deps)

    assert.isTrue(launched)
    expect(result.done).to.be.true
    expect(result.runPatch?.panes?.reviewer).to.exist
  })

  it('optional step with existing pane → still runs (does not skip)', () => {
    const step = {agent: 'reviewer', kind: 'review', optional: true} as StepConfig
    let waitCalled = false
    const deps = makeDeps({
      paneExists: () => true,
      waitForAgentDone() {
        waitCalled = true
      },
    })
    const run = makeRun({panes: {reviewer: 'hordr:hordr-test:reviewer'}})

    const result = review(run, step, deps)

    assert.isTrue(waitCalled, 'reviewer was waited on')
    expect(result.done).to.be.true
  })
})
