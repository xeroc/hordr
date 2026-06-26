import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {StepHandler} from '../../src/engine/steps/index.js'

import {advance} from '../../src/engine/advance.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

const YAML = `
hordr:
  concurrency: 2
  workflows:
    three-step:
      steps:
        - kind: implement
        - kind: test
        - kind: cleanup
`

describe('advance', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-adv-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-adv-cfg-'))
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

  it('throws when no run exists for the bean', () => {
    expect(() => advance('nope', makeDeps(), {})).to.throw(/no run for bean nope/)
  })

  it('closed run → terminal no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'closed'}))
    const result = advance('b1', makeDeps(), {})
    expect(result.terminal).to.be.true
    expect(result.done).to.be.true
  })

  it('blocked run → block no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'blocked'}))
    const result = advance('b1', makeDeps(), {})
    expect(result.block).to.be.true
    expect(result.terminal).to.be.false
  })

  it('pr-open run → block no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'pr-open'}))
    const result = advance('b1', makeDeps(), {})
    expect(result.block).to.be.true
  })

  it('awaiting-approval run → block no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'awaiting-approval'}))
    const result = advance('b1', makeDeps(), {})
    expect(result.block).to.be.true
  })

  it('running run with handler returning done → step increments', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'three-step'}))
    const handlers: Record<string, StepHandler> = {
      implement: () => ({done: true}),
    }

    const result = advance('b1', makeDeps(), handlers)

    expect(result.done).to.be.true
    expect(getRun('b1')?.step).to.equal(1)
  })

  it('running run with handler returning block → status becomes blocked', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 1, workflow: 'three-step'}))
    const handlers: Record<string, StepHandler> = {
      test: () => ({block: true, done: false, runPatch: {status: 'blocked'}}),
    }

    const result = advance('b1', makeDeps(), handlers)

    expect(result.block).to.be.true
    expect(getRun('b1')?.status).to.equal('blocked')
    expect(getRun('b1')?.step).to.equal(1, 'step not incremented on block')
  })

  it('handler runPatch.status is applied to run state', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 2, workflow: 'three-step'}))
    const handlers: Record<string, StepHandler> = {
      cleanup: () => ({done: true, runPatch: {status: 'closed'}}),
    }

    const result = advance('b1', makeDeps(), handlers)

    expect(result.terminal).to.be.true
    expect(getRun('b1')?.status).to.equal('closed')
  })

  it('step past workflow end → terminal (defensive)', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 99, workflow: 'three-step'}))

    const result = advance('b1', makeDeps(), {})

    expect(result.terminal).to.be.true
    expect(getRun('b1')?.status).to.equal('closed')
  })

  it('throws when workflow not found', () => {
    putRun(makeRun({bean: 'b1', status: 'running', workflow: 'nonexistent'}))

    expect(() => advance('b1', makeDeps(), {})).to.throw(/workflow "nonexistent"/)
  })

  it('throws when no handler for step kind', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'three-step'}))

    expect(() => advance('b1', makeDeps(), {})).to.throw(/no handler for step kind "implement"/)
  })

  it('idempotent: calling twice does not double-advance past the next step', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'three-step'}))
    const handlers: Record<string, StepHandler> = {
      cleanup: () => ({done: true, runPatch: {status: 'closed'}}),
      implement: () => ({done: true}),
      test: () => ({done: true}),
    }

    advance('b1', makeDeps(), handlers)
    assert.equal(getRun('b1')?.step, 1, 'first advance → step 1')

    advance('b1', makeDeps(), handlers)
    assert.equal(getRun('b1')?.step, 2, 'second advance → step 2')
  })
})
