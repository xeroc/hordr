/* eslint-disable camelcase -- created_at/updated_at mirror beans JSON contract */
import {captureOutput} from '@oclif/test'
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import Approve from '../../src/commands/approve.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {putRun} from '../../src/state/run-store.js'
import {makeRun} from '../engine/helpers.js'

const VALID_BODY = `
## Requirement

Need a thing.

## Spec

Build it.

## Acceptance Criteria

- [ ] AC one

## Test Plan

Run tests.
`.trim()

function beanJson(status: string, body: string): string {
  return JSON.stringify({
    body,
    created_at: '',
    etag: '',
    id: 'hordr-1234',
    path: '',
    priority: '',
    slug: '',
    status,
    title: '',
    type: '',
    updated_at: '',
  })
}

// concurrency:1 + a pre-seeded running run means approve's enqueue returns
// 'queued' without trying to spawn a supervisor (which would crash the test
// process with ENOENT on the missing hordr binary).
const YAML = `
hordr:
  concurrency: 1
  routing:
    default_workflow: implement
    plan_workflow: plan
`

const PROJECT_ROOT = process.cwd()

describe('commands/approve', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string

  beforeEach(() => {
    _setBeansPresentForTesting(true)
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-approve-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-approve-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    _setDepsForTesting(null)
  })

  afterEach(() => {
    _resetShell()
    _setDepsForTesting(null)
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
  })

  it('rejects if bean status is not draft', async () => {
    _setShellForTesting(() => beanJson('todo', VALID_BODY))
    const result = await captureOutput(async () => {
      await Approve.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    assert.isOk(result.error, 'command should error')
    expect(result.error!.message).to.match(/expected 'draft'/)
  })

  it('rejects if validate-spec fails (missing section)', async () => {
    const badBody = VALID_BODY.replace(/## Spec\n\nBuild it.\n/, '')
    _setShellForTesting(() => beanJson('draft', badBody))
    const result = await captureOutput(async () => {
      await Approve.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    assert.isOk(result.error, 'command should error')
    expect(result.error!.message).to.match(/spec invalid/)
  })

  it('on valid spec: bean -> todo, run -> queued', async () => {
    let setStatusResult = 'draft'
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        setStatusResult = args[args.indexOf('--status') + 1]!
        return JSON.stringify({status: setStatusResult})
      }

      return beanJson('draft', VALID_BODY)
    })

    // Seed: run in awaiting-approval + a running run to saturate concurrency.
    putRun(makeRun({bean: 'hordr-1234', status: 'awaiting-approval', workflow: 'plan'}))
    putRun(makeRun({bean: 'other-bean', status: 'running'}))

    const result = await captureOutput(async () => {
      await Approve.run(['hordr-1234'], {root: PROJECT_ROOT})
    })

    expect(result.error).to.be.undefined
    expect(result.stdout).to.match(/approved/)
    expect(setStatusResult).to.equal('todo')
  })

  it('--json flag: structured output', async () => {
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        return JSON.stringify({status: args[args.indexOf('--status') + 1]})
      }

      return beanJson('draft', VALID_BODY)
    })

    putRun(makeRun({bean: 'hordr-1234', status: 'awaiting-approval', workflow: 'plan'}))
    putRun(makeRun({bean: 'other-bean', status: 'running'}))

    const result = await captureOutput(async () => {
      await Approve.run(['hordr-1234', '--json'], {root: PROJECT_ROOT})
    })

    expect(result.error).to.be.undefined
    const parsed = JSON.parse(result.stdout.trim())
    expect(parsed).to.have.property('bean', 'hordr-1234')
    expect(parsed).to.have.property('beanStatus', 'todo')
    expect(parsed).to.have.property('queued', true)
  })
})
