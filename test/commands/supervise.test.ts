import type {Config} from '@oclif/core'

/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Supervise from '../../src/commands/supervise.js'
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
  const cmd = new Supervise(args, stubConfig)
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
`

describe('commands/supervise', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-sup-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-sup-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    _setDepsForTesting(makeDeps())
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
    _setDepsForTesting(null)
  })

  it('happy path: blocked run → supervise exits, prints status (AC #3)', async () => {
    putRun({
      bean: 'b1',
      panes: {implementer: 'wJ:p1'},
      started_unix: 1,
      status: 'blocked',
      step: 1,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['b1', '--pollMs', '1'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/supervise exited \(status=blocked\)/)
  })

  it('on closed run → prints "already closed"', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'closed',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/already closed/)
  })

  it('errors when no run exists', async () => {
    const res = await invoke(['nope'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
