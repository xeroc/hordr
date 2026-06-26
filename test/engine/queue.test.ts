/* eslint-disable camelcase -- started_unix is a SPEC.md §3 JSON field */
import {assert, expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {activeCount, capacity, drain, enqueue} from '../../src/engine/queue.js'
import {getRun, putRun} from '../../src/state/index.js'
import {makeDeps, makeRun} from '../engine/helpers.js'

const YAML = `
hordr:
  concurrency: 2
`

describe('queue', () => {
  let configDir: string
  let origCwd: string
  let stateDir: string

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-q-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-q-cfg-'))
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

  it('activeCount counts running and blocked runs', () => {
    putRun(makeRun({bean: 'b1', status: 'running'}))
    putRun(makeRun({bean: 'b2', status: 'blocked'}))
    putRun(makeRun({bean: 'b3', status: 'queued'}))
    expect(activeCount()).to.equal(2)
  })

  it('capacity reads concurrency from config', () => {
    expect(capacity()).to.equal(2)
  })

  it('enqueue starts immediately when slot available', () => {
    putRun(makeRun({bean: 'b1', status: 'queued'}))
    const spawned: string[] = []

    const result = enqueue('b1', makeDeps(), (id) => spawned.push(id))

    expect(result).to.equal('running')
    expect(getRun('b1')?.status).to.equal('running')
    assert.deepEqual(spawned, ['b1'])
  })

  it('enqueue returns queued when at capacity', () => {
    putRun(makeRun({bean: 'b1', status: 'running'}))
    putRun(makeRun({bean: 'b2', status: 'running'}))
    putRun(makeRun({bean: 'b3', status: 'queued'}))
    const spawned: string[] = []

    const result = enqueue('b3', makeDeps(), (id) => spawned.push(id))

    expect(result).to.equal('queued')
    expect(getRun('b3')?.status).to.equal('queued')
    assert.deepEqual(spawned, [])
  })

  it('enqueue throws when run does not exist', () => {
    expect(() => enqueue('nope', makeDeps())).to.throw(/no run for bean nope/)
  })

  it('drain starts queued runs up to capacity', () => {
    putRun(makeRun({bean: 'b1', started_unix: 1000, status: 'queued'}))
    putRun(makeRun({bean: 'b2', started_unix: 2000, status: 'queued'}))
    putRun(makeRun({bean: 'b3', started_unix: 3000, status: 'queued'}))
    const spawned: string[] = []

    const started = drain(makeDeps(), (id) => spawned.push(id))

    expect(started).to.have.lengthOf(2)
    expect(getRun('b1')?.status).to.equal('running')
    expect(getRun('b2')?.status).to.equal('running')
    expect(getRun('b3')?.status).to.equal('queued')
  })

  it('drain returns [] when queue empty', () => {
    const started = drain(makeDeps(), () => {})
    assert.deepEqual(started, [])
  })

  it('drain respects FIFO order (oldest started_unix first)', () => {
    putRun(makeRun({bean: 'late', started_unix: 3000, status: 'queued'}))
    putRun(makeRun({bean: 'early', started_unix: 1000, status: 'queued'}))
    putRun(makeRun({bean: 'mid', started_unix: 2000, status: 'queued'}))

    const started = drain(makeDeps(), () => {})

    expect(started[0]).to.equal('early')
    expect(started[1]).to.equal('mid')
  })
})
