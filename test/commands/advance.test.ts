import type {Config} from '@oclif/core'

/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {EngineDeps} from '../../src/engine/types.js'

import Advance from '../../src/commands/advance.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {putRun} from '../../src/state/index.js'
import {makeDeps} from '../engine/helpers.js'

const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({failures: [], successes: []}),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

interface RunResult {
  error?: Error & {oclif?: {exit?: number}}
  stderr: string
  stdout: string
}

async function invoke(args: string[]): Promise<RunResult> {
  const cmd = new Advance(args, stubConfig)
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  process.stderr.write = (chunk) => {
    err.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  try {
    await cmd.run()
    return {stderr: err.join(''), stdout: out.join('')}
  } catch (error) {
    return {error: error as Error & {oclif?: {exit?: number}}, stderr: err.join(''), stdout: out.join('')}
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

const YAML = `
hordr:
  concurrency: 2
  workflows:
    one-step:
      steps:
        - kind: implement
          agent: implementer
          pane: root
`

describe('commands/advance', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string
  let deps: EngineDeps

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-adv-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-adv-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    deps = makeDeps({
      launchAgent: (opts) => ({paneLabel: `hordr:${opts.beanId}:implementer`}),
      waitForAgentDone() {},
    })
    _setDepsForTesting(deps)
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
    _setDepsForTesting(null)
  })

  it('happy path: running run → executes step, prints new state (AC #2)', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'running',
      step: 0,
      updated_unix: 1,
      workflow: 'one-step',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/b1: done=true block=false/)
  })

  it('on closed run → prints "run is closed"', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'closed',
      step: 0,
      updated_unix: 1,
      workflow: 'one-step',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/run is closed/)
  })

  it('--all advances every non-terminal run', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'running',
      step: 0,
      updated_unix: 1,
      workflow: 'one-step',
      worktree: null,
    })
    putRun({
      bean: 'b2',
      panes: {},
      started_unix: 1,
      status: 'closed',
      step: 0,
      updated_unix: 1,
      workflow: 'one-step',
      worktree: null,
    })

    const res = await invoke(['--all'])

    expect(res.error).to.be.undefined
    const lines = res.stdout.trim().split('\n')
    expect(lines.some((l) => l.startsWith('b1:'))).to.be.true
    expect(lines.some((l) => l.startsWith('b2:'))).to.be.false
  })

  it('--json emits parseable JSON', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'running',
      step: 0,
      updated_unix: 1,
      workflow: 'one-step',
      worktree: null,
    })

    const res = await invoke(['b1', '--json'])

    expect(res.error).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {bean: string; result: {done: boolean}}
    expect(parsed.bean).to.equal('b1')
    expect(parsed.result.done).to.be.true
  })

  it('errors when bean id is missing and --all is not set', async () => {
    const res = await invoke([])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
