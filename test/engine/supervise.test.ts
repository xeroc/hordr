import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {StepHandler} from '../../src/engine/steps/index.js'

import {supervise} from '../../src/engine/supervise.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

const YAML = `
hordr:
  concurrency: 2
  workflows:
    multi:
      steps:
        - kind: implement
        - kind: test
        - kind: cleanup
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

    // Does not hang — returns void.
    supervise('b1', makeDeps(), 0, {})

    expect(getRun('b1')?.status).to.equal('closed')
  })

  it('exits immediately when run is blocked', () => {
    putRun(makeRun({bean: 'b1', status: 'blocked'}))

    supervise('b1', makeDeps(), 0, {})

    expect(getRun('b1')?.status).to.equal('blocked')
  })

  it('calls advance multiple times then exits when terminal', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'multi'}))
    const handlers: Record<string, StepHandler> = {
      cleanup: () => ({done: true, runPatch: {status: 'closed'}}),
      implement: () => ({done: true}),
      test: () => ({done: true}),
    }

    supervise('b1', makeDeps(), 0, handlers)

    const run = getRun('b1')
    assert.isOk(run)
    expect(run!.status).to.equal('closed')
    expect(run!.step).to.equal(3, 'all three steps completed')
  })

  it('exits when handler returns block', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 1, workflow: 'multi'}))
    const handlers: Record<string, StepHandler> = {
      test: () => ({block: true, done: false, runPatch: {status: 'blocked'}}),
    }

    supervise('b1', makeDeps(), 0, handlers)

    expect(getRun('b1')?.status).to.equal('blocked')
  })
})
