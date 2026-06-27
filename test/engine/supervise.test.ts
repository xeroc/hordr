import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {supervise} from '../../src/engine/supervise.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

const YAML = `
hordr:
  concurrency: 2
  workflows:
    multi:
      steps:
        - agent: implementer
        - agent: tester
        - hitl: external
`

describe('supervise', () => {
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
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
  })

  it('exits immediately when run is terminal (closed)', () => {
    putRun(makeRun({bean: 'b1', status: 'closed'}))
    supervise('b1', makeDeps(), 0)
    expect(getRun('b1')?.status).to.equal('closed')
  })

  it('exits immediately when run is blocked', () => {
    putRun(makeRun({bean: 'b1', status: 'blocked'}))
    supervise('b1', makeDeps(), 0)
    expect(getRun('b1')?.status).to.equal('blocked')
  })

  it('advances through agent steps then exits on hitl block', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'multi'}))
    // makeDeps returns 'done' for waitForAgentDone → first two agent steps
    // advance; third step is hitl → blocks → supervise exits.
    supervise('b1', makeDeps(), 0)

    const run = getRun('b1')
    expect(run?.step).to.equal(2)
    // hitl:external blocks — run stays at running status (external doesn't patch status).
    expect(run?.status).to.equal('running')
  })
})
