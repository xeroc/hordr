/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {putRun} from '../../src/state/index.js'
import {makeRun} from '../engine/helpers.js'

const CFG = 'hordr:\n  concurrency: 3\n'

describe('command: status', () => {
  let origCwd: string
  let cfgDir: string
  let stateDir: string

  beforeEach(() => {
    origCwd = process.cwd()
    cfgDir = mkdtempSync(path.join(origCwd, 'status-cfg-'))
    writeFileSync(path.join(cfgDir, '.beans.yml'), CFG)
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'status-st-'))
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    process.chdir(cfgDir)
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(cfgDir, {force: true, recursive: true})
    rmSync(stateDir, {force: true, recursive: true})
  })

  it('no runs → prints "no active runs"', async () => {
    const {error, stdout} = await runCommand(['status'])
    expect(error, undefined as never).to.be.undefined
    expect(stdout.trim()).to.equal('no active runs')
  })

  it('multiple runs → table with columns and queue summary', async () => {
    putRun(
      makeRun({
        bean: 'h-1001',
        panes: {implementer: 'p1'},
        status: 'running',
        step: 3,
        workflow: 'implement',
        worktree: {branch: 'bean/h-1001', workspace_id: 'ws-1'},
      }),
    )
    putRun(makeRun({bean: 'h-1002', started_unix: 2000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'h-1003', started_unix: 3000, status: 'blocked', workflow: 'implement'}))
    putRun(
      makeRun({
        bean: 'h-1004',
        started_unix: 4000,
        status: 'pr-open',
        workflow: 'implement',
      }),
    )

    const {error, stdout} = await runCommand(['status'])
    expect(error, undefined as never).to.be.undefined

    const lines = stdout.split('\n')
    expect(lines[0]).to.match(/^bean\s+workflow\s+status\s+step\s+worktree\s+panes/)
    expect(stdout).to.contain('h-1001')
    expect(stdout).to.contain('running')
    expect(stdout).to.contain('queued')
    expect(stdout).to.contain('blocked')
    expect(stdout).to.contain('pr-open')
    expect(stdout).to.contain('ws-1')
    expect(stdout).to.contain('implementer:p1')
    // queue summary line
    expect(stdout).to.match(/queue: \d+\/3 active, \d+ queued/)
  })

  it('--json → parseable JSON with runs + queue', async () => {
    putRun(makeRun({bean: 'h-2001', status: 'running', workflow: 'implement'}))
    putRun(makeRun({bean: 'h-2002', started_unix: 2000, status: 'queued', workflow: 'implement'}))

    const {error, stdout} = await runCommand(['status', '--json'])
    expect(error, undefined as never).to.be.undefined

    const parsed = JSON.parse(stdout) as {
      queue: {active: number; capacity: number; queued: number}
      runs: Array<{bean: string; status: string}>
    }
    expect(parsed.runs).to.have.lengthOf(2)
    expect(parsed.runs.map((r) => r.bean)).to.include.members(['h-2001', 'h-2002'])
    expect(parsed.queue).to.have.property('active')
    expect(parsed.queue).to.have.property('capacity')
    expect(parsed.queue).to.have.property('queued')
  })

  it('queue summary shows correct active/queued counts', async () => {
    // 2 active (running + blocked), 2 queued, capacity 3
    putRun(makeRun({bean: 'a1', status: 'running', workflow: 'implement'}))
    putRun(makeRun({bean: 'a2', started_unix: 2000, status: 'blocked', workflow: 'implement'}))
    putRun(makeRun({bean: 'q1', started_unix: 3000, status: 'queued', workflow: 'implement'}))
    putRun(makeRun({bean: 'q2', started_unix: 4000, status: 'queued', workflow: 'implement'}))

    const {error, stdout} = await runCommand(['status'])
    expect(error, undefined as never).to.be.undefined
    expect(stdout).to.contain('queue: 2/3 active, 2 queued')
  })
})
