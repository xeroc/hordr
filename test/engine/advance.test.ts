import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {advance} from '../../src/engine/advance.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

const YAML = `
hordr:
  concurrency: 2
  workflows:
    three-step:
      steps:
        - agent: implementer
        - agent: tester
        - hitl: external
`

describe('advance (self-trigger model)', () => {
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

  it('throws when no run exists', () => {
    expect(() => advance('nope', makeDeps())).to.throw(/no run for bean nope/)
  })

  it('closed run → terminal no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'closed'}))
    const result = advance('b1', makeDeps())
    expect(result.terminal).to.be.true
  })

  it('blocked run → no-op', () => {
    putRun(makeRun({bean: 'b1', status: 'blocked'}))
    const result = advance('b1', makeDeps())
    expect(result.block).to.be.true
  })

  it('first advance on agent step → spawns agent, step stays', () => {
    // paneExists=false in default mock → launchOrReuse spawns.
    putRun(makeRun({bean: 'b1', status: 'running', step: 0, workflow: 'three-step'}))
    const result = advance('b1', makeDeps())
    expect(result.done).to.be.false // agent spawned but not done
    expect(getRun('b1')?.step).to.equal(0) // step not bumped
    expect(getRun('b1')?.panes.implementer).to.exist // pane recorded
  })

  it('second advance (agent called back) → bumps step + spawns next agent', () => {
    // Setup: step 0 already ran (implementer pane stored, paneExists=true).
    const deps = makeDeps({paneExists: () => true})
    putRun(
      makeRun({
        bean: 'b1',
        status: 'running',
        step: 0,
        workflow: 'three-step',
        panes: {implementer: 'wX:p1'},
      }),
    )

    const result = advance('b1', deps)

    // Step 0 done → bump to 1 → recurse → step 1 agent (tester) spawns → done:false.
    expect(result.done).to.be.false
    expect(getRun('b1')?.step).to.equal(1)
    expect(getRun('b1')?.panes.tester).to.exist
  })

  it('agent calls advance on last agent step → bumps to hitl → blocks', () => {
    const deps = makeDeps({paneExists: () => true})
    putRun(
      makeRun({
        bean: 'b1',
        status: 'running',
        step: 1,
        workflow: 'three-step',
        panes: {implementer: 'wX:p1', tester: 'wX:p2'},
      }),
    )

    const result = advance('b1', deps)

    // Step 1 done → bump to 2 → recurse → step 2 is hitl:external → blocks.
    expect(result.block).to.be.true
    expect(getRun('b1')?.step).to.equal(2)
  })

  it('past workflow end → terminal', () => {
    putRun(makeRun({bean: 'b1', status: 'running', step: 99, workflow: 'three-step'}))
    const result = advance('b1', makeDeps())
    expect(result.terminal).to.be.true
    expect(getRun('b1')?.status).to.equal('closed')
  })
})
