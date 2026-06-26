/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {assert, expect} from 'chai'
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {deleteRun, getRun, listRuns, putRun, type RunState, StateError} from '../../src/state/index.js'

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    bean: 'hordr-test',
    panes: {},
    started_unix: Math.floor(Date.now() / 1000),
    status: 'queued',
    step: 0,
    updated_unix: Math.floor(Date.now() / 1000),
    workflow: 'implement',
    worktree: null,
    ...overrides,
  }
}

describe('run-store', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hordr-state-'))

  before(() => {
    process.env.HERDR_PLUGIN_STATE_DIR = dir
  })

  beforeEach(() => {
    for (const f of readdirSync(dir)) {
      rmSync(path.join(dir, f), {force: true, recursive: true})
    }
  })

  after(() => {
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(dir, {force: true, recursive: true})
  })

  it('putRun then getRun round-trips identical data', () => {
    const run = makeRun({
      bean: 'hordr-rt',
      panes: {implementer: 'hordr:hordr-rt:implementer'},
      worktree: {branch: 'bean/hordr-rt', workspace_id: 'ws-1'},
    })
    putRun(run)
    const got = getRun('hordr-rt')
    assert.isNotNull(got)
    if (!got) return
    assert.deepEqual(got, {...run, updated_unix: got.updated_unix})
    assert.isAbove(got.updated_unix, 0)
  })

  it('corrupt JSON throws StateError with bean id', () => {
    writeFileSync(path.join(dir, 'hordr-bad.json'), 'not json {{{')
    expect(() => getRun('hordr-bad')).to.throw(StateError, /hordr-bad/)
  })

  it('listRuns({status}) returns only matching Runs', () => {
    putRun(makeRun({bean: 'hordr-f1', status: 'queued'}))
    putRun(makeRun({bean: 'hordr-f2', status: 'running'}))
    putRun(makeRun({bean: 'hordr-f3', status: 'queued'}))
    assert.equal(listRuns({status: 'queued'}).length, 2)
    assert.equal(listRuns().length, 3)
    assert.equal(listRuns({status: 'closed'}).length, 0)
  })

  it('putRun leaves no temp files (atomic by construction)', () => {
    putRun(makeRun({bean: 'hordr-atom'}))
    const tmps = readdirSync(dir).filter((f) => f.includes('.tmp-'))
    assert.deepEqual(tmps, [])
    assert.isTrue(existsSync(path.join(dir, 'hordr-atom.json')))
    expect(() => getRun('hordr-atom')).to.not.throw()
  })

  it('deleteRun returns true once, then false; clears state', () => {
    putRun(makeRun({bean: 'hordr-del'}))
    assert.isTrue(deleteRun('hordr-del'))
    assert.isNull(getRun('hordr-del'))
    assert.isFalse(deleteRun('hordr-del'))
  })

  it('listRuns returns [] when state dir does not exist', () => {
    const prev = process.env.HERDR_PLUGIN_STATE_DIR
    process.env.HERDR_PLUGIN_STATE_DIR = path.join(dir, 'does-not-exist')
    try {
      assert.deepEqual(listRuns(), [])
    } finally {
      process.env.HERDR_PLUGIN_STATE_DIR = prev
    }
  })
})
