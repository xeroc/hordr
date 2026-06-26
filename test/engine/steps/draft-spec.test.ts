import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../../src/beans/client.js'
import {draftSpec} from '../../../src/engine/steps/draft-spec.js'
import {StepError} from '../../../src/engine/steps/shared.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {agent: 'planner', kind: 'draft-spec', optional: false} as StepConfig

describe('draft-spec handler', () => {
  beforeEach(() => {
    _setBeansPresentForTesting(true)
    // Return whatever status is being set.
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        return JSON.stringify({status: args[args.indexOf('--status') + 1]})
      }

      return '{"status":"draft"}'
    })
  })

  afterEach(() => {
    _resetShell()
  })

  it('launches planner, sets bean → draft, returns done with awaiting-approval', () => {
    let launched = false
    const deps = makeDeps({
      launchAgent(opts) {
        launched = true
        return {paneLabel: `hordr:${opts.beanId}:planner`}
      },
    })
    const run = makeRun({status: 'planning'})

    const result = draftSpec(run, step, deps)

    assert.isTrue(launched, 'planner was launched')
    expect(result.done).to.be.true
    expect(result.runPatch?.status).to.equal('awaiting-approval')
    expect(result.runPatch?.panes?.planner).to.equal('hordr:hordr-test:planner')
  })

  it('idempotent: reuses existing planner pane when paneExists is true', () => {
    let launchCount = 0
    const deps = makeDeps({
      launchAgent() {
        launchCount++
        return {paneLabel: 'should-not-be-called'}
      },
      paneExists: () => true,
    })
    const run = makeRun({
      panes: {planner: 'hordr:hordr-test:planner'},
      status: 'planning',
    })

    const result = draftSpec(run, step, deps)

    expect(launchCount).to.equal(0, 'did not re-launch existing pane')
    expect(result.done).to.be.true
  })

  it('stores pane label in runPatch for persistence', () => {
    const deps = makeDeps()
    const run = makeRun({status: 'planning'})

    const result = draftSpec(run, step, deps)

    expect(result.runPatch?.panes).to.exist
    expect(result.runPatch!.panes!.planner).to.exist
  })

  it('throws StepError is not thrown on normal completion', () => {
    const deps = makeDeps()
    const run = makeRun({status: 'planning'})

    expect(() => draftSpec(run, step, deps)).to.not.throw(StepError)
  })
})
