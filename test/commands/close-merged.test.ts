/* eslint-disable camelcase -- workspace_id is a SPEC.md §3 JSON field */
import {runCommand} from '@oclif/test'
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import {_resetGh, _setGhForTesting, _setGhPresentForTesting} from '../../src/engine/close-merged.js'
import {STUB_DEPS} from '../../src/engine/types.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeRun} from '../engine/helpers.js'

// gh mock keyed by branch → {state, mergedAt}; throw on unknown branch.
function ghMock(branches: Record<string, {mergedAt: null | string; state: string}>): (args: string[]) => string {
  return (args) => {
    const idx = args.indexOf('--branch')
    const branch = idx === -1 ? '' : args[idx + 1] ?? ''
    const entry = branches[branch]
    if (!entry) throw Object.assign(new Error('gh not found'), {stderr: 'no PR'})
    return JSON.stringify(entry)
  }
}

describe('command: close-merged', () => {
  let origCwd: string
  let stateDir: string
  let beanStatuses: Record<string, string>
  let removedWorktrees: string[]

  beforeEach(() => {
    origCwd = process.cwd()
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'cmcmd-st-'))
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    beanStatuses = {}
    removedWorktrees = []
    _setBeansPresentForTesting(true)
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        const id = args[1] ?? ''
        const st = args[args.indexOf('--status') + 1] ?? 'completed'
        beanStatuses[id] = st
        return JSON.stringify({status: st})
      }

      return '{"status":"completed"}'
    })
    _setGhPresentForTesting(true)
    _setDepsForTesting({
      ...STUB_DEPS,
      removeWorktree(workspaceId: string) {
        removedWorktrees.push(workspaceId)
      },
    })
  })

  afterEach(() => {
    _setDepsForTesting(null)
    _resetShell()
    _resetGh()
    delete process.env.HERDR_PLUGIN_STATE_DIR
    process.chdir(origCwd)
    rmSync(stateDir, {force: true, recursive: true})
  })

  it('no pr-open runs → "no pr-open runs to scan"', async () => {
    _setGhForTesting(() => {
      throw new Error('should not be called')
    })

    const {error, stdout} = await runCommand(['close-merged'])
    expect(error, undefined as never).to.be.undefined
    expect(stdout.trim()).to.equal('no pr-open runs to scan')
  })

  it('merged PR → run closed, bean completed, worktree removed', async () => {
    _setGhForTesting(ghMock({'bean/merged': {mergedAt: '2026-01-01', state: 'MERGED'}}))
    putRun(
      makeRun({
        bean: 'b1',
        status: 'pr-open',
        workflow: 'implement',
        worktree: {branch: 'bean/merged', workspace_id: 'ws-1'},
      }),
    )

    const {error, stdout} = await runCommand(['close-merged'])
    expect(error, undefined as never).to.be.undefined

    expect(stdout).to.match(/^closed 1: b1/)
    expect(getRun('b1')?.status).to.equal('closed')
    expect(beanStatuses.b1).to.equal('completed')
    assert.deepEqual(removedWorktrees, ['ws-1'])
  })

  it('open PR → skipped, run unchanged', async () => {
    _setGhForTesting(ghMock({'bean/open': {mergedAt: null, state: 'OPEN'}}))
    putRun(
      makeRun({
        bean: 'b2',
        status: 'pr-open',
        workflow: 'implement',
        worktree: {branch: 'bean/open', workspace_id: 'ws-2'},
      }),
    )

    const {error, stdout} = await runCommand(['close-merged'])
    expect(error, undefined as never).to.be.undefined

    expect(stdout).to.match(/skipped 1 \(PR still open\): b2/)
    expect(getRun('b2')?.status).to.equal('pr-open')
  })

  it('gh fails → failed, run unchanged', async () => {
    _setGhForTesting(() => {
      throw Object.assign(new Error('gh fail'), {stderr: 'auth error'})
    })
    putRun(
      makeRun({
        bean: 'b3',
        status: 'pr-open',
        workflow: 'implement',
        worktree: {branch: 'bean/bad', workspace_id: 'ws-3'},
      }),
    )

    const {error, stdout} = await runCommand(['close-merged'])
    expect(error, undefined as never).to.be.undefined

    expect(stdout).to.match(/failed 1 \(gh error\): b3/)
    expect(getRun('b3')?.status).to.equal('pr-open')
  })

  it('--json → parseable JSON result', async () => {
    _setGhForTesting(
      ghMock({
        'bean/merged': {mergedAt: '2026-01-01', state: 'MERGED'},
        'bean/open': {mergedAt: null, state: 'OPEN'},
      }),
    )
    putRun(
      makeRun({
        bean: 'b4',
        status: 'pr-open',
        workflow: 'implement',
        worktree: {branch: 'bean/merged', workspace_id: 'ws-4'},
      }),
    )
    putRun(
      makeRun({
        bean: 'b5',
        started_unix: 2000,
        status: 'pr-open',
        workflow: 'implement',
        worktree: {branch: 'bean/open', workspace_id: 'ws-5'},
      }),
    )

    const {error, stdout} = await runCommand(['close-merged', '--json'])
    expect(error, undefined as never).to.be.undefined

    const parsed = JSON.parse(stdout) as {closed: string[]; failed: string[]; skipped: string[]}
    assert.deepEqual(parsed.closed, ['b4'])
    assert.deepEqual(parsed.skipped, ['b5'])
    assert.deepEqual(parsed.failed, [])
  })
})
