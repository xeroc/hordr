/* eslint-disable camelcase -- workspace_id is a SPEC.md §3 JSON field */
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import {
  _resetGh,
  _setGhForTesting,
  _setGhPresentForTesting,
  closeMerged,
  CloseMergedError,
} from '../../src/engine/close-merged.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

function ghMockForBranches(
  branches: Record<string, {mergedAt: null | string; state: string}>,
): (args: string[]) => string {
  return (args) => {
    const idx = args.indexOf('--branch')
    const branch = idx === -1 ? '' : args[idx + 1] ?? ''
    const entry = branches[branch]
    if (!entry) throw Object.assign(new Error('gh not found'), {stderr: 'no PR'})
    return JSON.stringify(entry)
  }
}

describe('close-merged', () => {
  let stateDir: string

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-cm-st-'))
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    _setBeansPresentForTesting(true)
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        return JSON.stringify({status: args[args.indexOf('--status') + 1]})
      }

      return '{"status":"completed"}'
    })
    _setGhPresentForTesting(true)
  })

  afterEach(() => {
    _resetShell()
    _resetGh()
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
  })

  it('merged PR → bean completed, worktree removed, run closed', () => {
    _setGhForTesting(ghMockForBranches({'bean/merged': {mergedAt: '2026-01-01', state: 'MERGED'}}))
    let removed: string | undefined
    const deps = makeDeps({
      removeWorktree(wsId) {
        removed = wsId
      },
    })
    putRun(makeRun({bean: 'b1', status: 'pr-open', worktree: {branch: 'bean/merged', workspace_id: 'ws-1'}}))

    const result = closeMerged(deps)

    assert.deepEqual(result.closed, ['b1'])
    expect(getRun('b1')?.status).to.equal('closed')
    expect(removed).to.equal('ws-1')
  })

  it('open PR → skipped, run unchanged', () => {
    _setGhForTesting(ghMockForBranches({'bean/open': {mergedAt: null, state: 'OPEN'}}))
    putRun(makeRun({bean: 'b1', status: 'pr-open', worktree: {branch: 'bean/open', workspace_id: 'ws-1'}}))

    const result = closeMerged(makeDeps())

    assert.deepEqual(result.skipped, ['b1'])
    expect(getRun('b1')?.status).to.equal('pr-open')
  })

  it('gh fails on one run → failed, others continue', () => {
    _setGhForTesting(
      ghMockForBranches({
        'bean/bad': {mergedAt: null, state: 'OPEN'}, // will be overridden below
        'bean/good': {mergedAt: '2026-01-01', state: 'MERGED'},
      }),
    )
    // Override: bean/bad should trigger a gh error.
    _setGhForTesting((args) => {
      const idx = args.indexOf('--branch')
      const branch = idx === -1 ? '' : args[idx + 1] ?? ''
      if (branch === 'bean/good') return JSON.stringify({mergedAt: '2026-01-01', state: 'MERGED'})
      throw Object.assign(new Error('gh fail'), {stderr: 'auth error'})
    })
    putRun(makeRun({bean: 'good', status: 'pr-open', worktree: {branch: 'bean/good', workspace_id: 'ws-1'}}))
    putRun(makeRun({bean: 'bad', status: 'pr-open', worktree: {branch: 'bean/bad', workspace_id: 'ws-2'}}))

    const result = closeMerged(makeDeps())

    assert.include(result.closed, 'good')
    assert.include(result.failed, 'bad')
  })

  it('gh missing → throws CloseMergedError', () => {
    _setGhPresentForTesting(false)
    putRun(makeRun({bean: 'b1', status: 'pr-open', worktree: {branch: 'bean/x', workspace_id: 'ws-1'}}))

    expect(() => closeMerged(makeDeps())).to.throw(CloseMergedError, /gh CLI not found/)
  })

  it('no pr-open runs → empty arrays, no gh calls', () => {
    let ghCalled = false
    _setGhForTesting(() => {
      ghCalled = true
      return '{}'
    })

    const result = closeMerged(makeDeps())

    assert.deepEqual(result.closed, [])
    assert.deepEqual(result.failed, [])
    assert.deepEqual(result.skipped, [])
    assert.isFalse(ghCalled)
  })

  it('run without worktree.branch → failed', () => {
    _setGhForTesting(() => JSON.stringify({mergedAt: null, state: 'OPEN'}))
    putRun(makeRun({bean: 'b1', status: 'pr-open', worktree: null}))

    const result = closeMerged(makeDeps())

    assert.deepEqual(result.failed, ['b1'])
  })
})
