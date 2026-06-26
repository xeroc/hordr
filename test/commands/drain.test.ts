/* eslint-disable camelcase -- started_unix is a SPEC.md §3 JSON field */
import {runCommand} from '@oclif/test'
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {getRun, putRun} from '../../src/state/index.js'
import {makeRun} from '../engine/helpers.js'

describe('command: drain', () => {
  let origCwd: string
  let cfgDir: string
  let stateDir: string
  let origBinPath: string | undefined

  beforeEach(() => {
    origCwd = process.cwd()
    origBinPath = process.env.HERDR_BIN_PATH
    // ponytail: /bin/true makes the detached supervisor spawn a silent no-op.
    process.env.HERDR_BIN_PATH = '/bin/true'
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'drain-st-'))
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    if (origBinPath === undefined) delete process.env.HERDR_BIN_PATH
    else process.env.HERDR_BIN_PATH = origBinPath
    rmSync(stateDir, {force: true, recursive: true})
    if (cfgDir) rmSync(cfgDir, {force: true, recursive: true})
  })

  function withConfig(concurrency: number): void {
    cfgDir = mkdtempSync(path.join(process.cwd(), 'drain-cfg-'))
    writeFileSync(path.join(cfgDir, '.beans.yml'), `hordr:\n  concurrency: ${concurrency}\n`)
    process.chdir(cfgDir)
  }

  it('empty queue → "queue empty (nothing to drain)"', async () => {
    withConfig(3)
    const {error, stdout} = await runCommand(['drain'])
    expect(error, undefined as never).to.be.undefined
    expect(stdout.trim()).to.equal('queue empty (nothing to drain)')
  })

  it('2 queued + capacity 3 → starts both, prints count + ids', async () => {
    withConfig(3)
    putRun(makeRun({bean: 'b1', started_unix: 1000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'b2', started_unix: 2000, status: 'queued', workflow: 'implement'}))

    const {error, stdout} = await runCommand(['drain'])
    expect(error, undefined as never).to.be.undefined

    expect(stdout).to.match(/^started 2 run\(s\):/)
    expect(stdout).to.contain('b1')
    expect(stdout).to.contain('b2')
    expect(getRun('b1')?.status).to.equal('running')
    expect(getRun('b2')?.status).to.equal('running')
  })

  it('--json → parseable JSON with count + started ids', async () => {
    withConfig(3)
    putRun(makeRun({bean: 'j1', started_unix: 1000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'j2', started_unix: 2000, status: 'queued', workflow: 'implement'}))

    const {error, stdout} = await runCommand(['drain', '--json'])
    expect(error, undefined as never).to.be.undefined

    const parsed = JSON.parse(stdout) as {count: number; started: string[]}
    expect(parsed.count).to.equal(2)
    assert.sameMembers(parsed.started, ['j1', 'j2'])
  })

  it('capacity 2, 3 queued → starts 2, leaves 1 queued', async () => {
    withConfig(2)
    putRun(makeRun({bean: 'c1', started_unix: 1000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'c2', started_unix: 2000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'c3', started_unix: 3000, status: 'queued', workflow: 'implement'}))

    const {error, stdout} = await runCommand(['drain'])
    expect(error, undefined as never).to.be.undefined

    expect(stdout).to.match(/^started 2 run\(s\):/)
    expect(getRun('c1')?.status).to.equal('running')
    expect(getRun('c2')?.status).to.equal('running')
    expect(getRun('c3')?.status).to.equal('queued')
  })
})
