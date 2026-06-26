/* eslint-disable camelcase -- created_at/updated_at/started_unix mirror JSON contract */
import {captureOutput} from '@oclif/test'
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {EngineDeps} from '../../src/engine/types.js'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import Plan from '../../src/commands/plan.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {getRun, putRun} from '../../src/state/run-store.js'

const YAML = `
hordr:
  concurrency: 3
  workflows:
    plan:
      steps:
        - kind: draft-spec
          agent: planner
        - kind: hitl
  routing:
    default_workflow: implement
    plan_workflow: plan
`

function beanJson(status: string): string {
  return JSON.stringify({
    body: '',
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

function mockDeps(beanId: string): EngineDeps {
  return {
    createWorktree: () => ({branch: `bean/${beanId}`, workspaceId: `/tmp/wt-${beanId}`}),
    detectTestSignal: () => null,
    launchAgent: (opts) => ({paneLabel: `hordr:${opts.beanId}:${opts.role}`}),
    paneExists: () => false,
    readAgentOutput: () => '',
    removeWorktree() {},
    waitForAgentDone() {},
  }
}

const PROJECT_ROOT = process.cwd()

describe('commands/plan', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string

  beforeEach(() => {
    _setBeansPresentForTesting(true)
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-plan-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-plan-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    _setDepsForTesting(mockDeps('hordr-1234'))
  })

  afterEach(() => {
    _resetShell()
    _setDepsForTesting(null)
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
  })

  it('happy path: creates worktree, transitions run to awaiting-approval', async () => {
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        return JSON.stringify({status: args[args.indexOf('--status') + 1]})
      }

      return beanJson('todo')
    })

    const result = await captureOutput(async () => {
      await Plan.run(['hordr-1234'], {root: PROJECT_ROOT})
    })

    expect(result.error).to.be.undefined
    const run = getRun('hordr-1234')
    assert.isOk(run, 'run should exist')
    expect(run!.status).to.equal('awaiting-approval')
    expect(run!.step).to.equal(1)
    expect(run!.worktree).to.not.be.null
    expect(run!.panes).to.have.property('planner')
  })

  it('refuses if bean is not in todo', async () => {
    _setShellForTesting(() => beanJson('in-progress'))
    const result = await captureOutput(async () => {
      await Plan.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    assert.isOk(result.error)
    expect(result.error!.message).to.match(/expected 'todo'/)
  })

  it('refuses if run already exists', async () => {
    _setShellForTesting(() => beanJson('todo'))

    const now = Math.floor(Date.now() / 1000)
    putRun({
      bean: 'hordr-1234',
      panes: {},
      started_unix: now,
      status: 'planning',
      step: 0,
      updated_unix: now,
      workflow: 'plan',
      worktree: null,
    })

    const result = await captureOutput(async () => {
      await Plan.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    assert.isOk(result.error)
    expect(result.error!.message).to.match(/run already exists/)
  })

  it('--json flag: structured output', async () => {
    _setShellForTesting((_cmd, args) => {
      if (args.includes('--status')) {
        return JSON.stringify({status: args[args.indexOf('--status') + 1]})
      }

      return beanJson('todo')
    })

    const result = await captureOutput(async () => {
      await Plan.run(['hordr-1234', '--json'], {root: PROJECT_ROOT})
    })

    expect(result.error).to.be.undefined
    const parsed = JSON.parse(result.stdout.trim())
    expect(parsed).to.have.property('bean', 'hordr-1234')
    expect(parsed).to.have.property('run')
    expect(parsed.run).to.have.property('status', 'awaiting-approval')
  })
})
