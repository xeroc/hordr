/* eslint-disable camelcase -- workspace_id/open_pr match SPEC.md §3/§4 fields */
import {assert, expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {_resetGh, _setGhForTesting, pr} from '../../../src/engine/steps/pr.js'
import {StepError} from '../../../src/engine/steps/shared.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {agent: 'open_pr', kind: 'pr', optional: false} as StepConfig

describe('pr handler', () => {
  afterEach(() => {
    _resetGh()
  })

  it('throws StepError when no worktree in run state', () => {
    const run = makeRun({worktree: null})

    expect(() => pr(run, step, makeDeps())).to.throw(StepError, /no worktree/)
  })

  it('idempotent: existing PR → skip with pr-open status', () => {
    _setGhForTesting(() => JSON.stringify([{url: 'https://github.com/repo/pull/1'}]))
    const run = makeRun({worktree: {branch: 'bean/hordr-test', workspace_id: '/tmp/wt'}})

    const result = pr(run, step, makeDeps())

    expect(result.done).to.be.true
    expect(result.runPatch?.status).to.equal('pr-open')
  })

  it('no existing PR → spawns open_pr agent and returns done with pr-open', () => {
    _setGhForTesting(() => '[]')
    let launched = false
    const deps = makeDeps({
      launchAgent(opts) {
        launched = true
        return {paneLabel: `hordr:${opts.beanId}:open_pr`}
      },
    })
    const run = makeRun({worktree: {branch: 'bean/hordr-test', workspace_id: '/tmp/wt'}})

    const result = pr(run, step, deps)

    assert.isTrue(launched, 'open_pr agent was launched')
    expect(result.done).to.be.true
    expect(result.runPatch?.status).to.equal('pr-open')
    expect(result.runPatch?.panes?.open_pr).to.exist
  })

  it('idempotent: reuses existing open_pr pane when alive', () => {
    _setGhForTesting(() => '[]')
    let launchCount = 0
    const deps = makeDeps({
      launchAgent() {
        launchCount++
        return {paneLabel: 'x'}
      },
      paneExists: () => true,
    })
    const run = makeRun({
      panes: {open_pr: 'hordr:hordr-test:open_pr'},
      worktree: {branch: 'bean/hordr-test', workspace_id: '/tmp/wt'},
    })

    pr(run, step, deps)

    expect(launchCount).to.equal(0)
  })
})
