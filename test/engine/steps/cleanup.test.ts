/* eslint-disable camelcase -- workspace_id is a SPEC.md §3 JSON field */
import {expect} from 'chai'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../../src/beans/client.js'
import {cleanup} from '../../../src/engine/steps/cleanup.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {kind: 'cleanup', optional: false} as StepConfig

describe('cleanup handler', () => {
  let setStatusArg: string | undefined
  let removedWorktree: string | undefined

  beforeEach(() => {
    setStatusArg = undefined
    removedWorktree = undefined
    _setBeansPresentForTesting(true)
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        setStatusArg = args[args.indexOf('--status') + 1]
        return JSON.stringify({status: setStatusArg})
      }

      return '{"status":"completed"}'
    })
  })

  afterEach(() => {
    _resetShell()
  })

  it('sets bean → completed, removes worktree, returns done with closed', () => {
    const deps = makeDeps({
      removeWorktree(wsId) {
        removedWorktree = wsId
      },
    })
    const run = makeRun({worktree: {branch: 'bean/hordr-test', workspace_id: 'ws-1'}})

    const result = cleanup(run, step, deps)

    expect(setStatusArg).to.equal('completed')
    expect(removedWorktree).to.equal('ws-1')
    expect(result.done).to.be.true
    expect(result.runPatch?.status).to.equal('closed')
  })

  it('still closes when worktree is already null', () => {
    const deps = makeDeps()
    const run = makeRun({worktree: null})

    const result = cleanup(run, step, deps)

    expect(result.done).to.be.true
    expect(result.runPatch?.status).to.equal('closed')
  })

  it('does not throw when worktree removal is a no-op (null worktree)', () => {
    const deps = makeDeps()
    const run = makeRun({worktree: null})

    expect(() => cleanup(run, step, deps)).to.not.throw()
  })
})
