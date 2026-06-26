import type {Config} from '@oclif/core'

/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Take from '../../src/commands/take.js'
import {putRun} from '../../src/state/index.js'

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
  const cmd = new Take(args, stubConfig)
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

describe('commands/take', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string
  let origHerdrBin: string | undefined

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-take-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-take-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    // /bin/true exits 0 silently — simulates a successful herdr pane zoom.
    origHerdrBin = process.env.HERDR_BIN_PATH
    process.env.HERDR_BIN_PATH = '/bin/true'
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
    if (origHerdrBin === undefined) delete process.env.HERDR_BIN_PATH
    else process.env.HERDR_BIN_PATH = origHerdrBin
  })

  it('happy path: blocked run with panes → focuses last pane (AC #4)', async () => {
    putRun({
      bean: 'b1',
      panes: {implementer: 'wJ:p1', tester: 'wJ:p2'},
      started_unix: 1,
      status: 'blocked',
      step: 1,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.undefined
    // tester is the last-inserted pane → focus target.
    expect(res.stdout).to.match(/focused pane wJ:p2 for b1/)
  })

  it('rejects if run is not blocked', async () => {
    putRun({
      bean: 'b1',
      panes: {implementer: 'wJ:p1'},
      started_unix: 1,
      status: 'running',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not blocked/)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('rejects if run has no panes recorded', async () => {
    putRun({
      bean: 'b1',
      panes: {},
      started_unix: 1,
      status: 'blocked',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['b1'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/no panes recorded/)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('rejects if no run exists', async () => {
    const res = await invoke(['nope'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
