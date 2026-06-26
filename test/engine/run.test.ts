/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {assert, expect} from 'chai'

import type {RunState, RunStatus} from '../../src/state/schema.js'

import {ALLOWED_TRANSITIONS, transition, TransitionError} from '../../src/engine/run.js'

function makeRun(status: RunStatus, overrides: Partial<RunState> = {}): RunState {
  return {
    bean: 'hordr-test',
    panes: {},
    started_unix: 1000,
    status,
    step: 0,
    updated_unix: 1000,
    workflow: 'implement',
    worktree: null,
    ...overrides,
  }
}

describe('run state machine', () => {
  // --- All valid transitions (table-driven from ALLOWED_TRANSITIONS) ---
  for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of targets) {
      it(`transition ${from} -> ${to} succeeds`, () => {
        const result = transition(makeRun(from as RunStatus), to as RunStatus)
        expect(result.status).to.equal(to)
      })
    }
  }

  // --- Key invalid transitions ---
  const invalid: Array<[RunStatus, RunStatus]> = [
    ['awaiting-approval', 'running'],
    ['awaiting-approval', 'blocked'],
    ['blocked', 'queued'],
    ['blocked', 'pr-open'],
    ['closed', 'running'],
    ['closed', 'planning'],
    ['planning', 'running'],
    ['planning', 'queued'],
    ['pr-open', 'running'],
    ['queued', 'blocked'],
    ['queued', 'closed'],
    ['running', 'closed'],
    ['running', 'planning'],
    ['running', 'queued'],
    ['running', 'awaiting-approval'],
  ]

  for (const [from, to] of invalid) {
    it(`transition ${from} -> ${to} throws TransitionError`, () => {
      expect(() => transition(makeRun(from), to)).to.throw(TransitionError)
    })
  }

  // --- AC-specific assertions ---
  it('transition(running) from queued succeeds (AC)', () => {
    const result = transition(makeRun('queued'), 'running')
    expect(result.status).to.equal('running')
  })

  it('transition(closed) from running throws — must go through pr-open (AC)', () => {
    expect(() => transition(makeRun('running'), 'closed')).to.throw(TransitionError, /running -> closed/)
  })

  it('error message names both states and lists allowed targets', () => {
    try {
      transition(makeRun('running'), 'closed')
      assert.fail('should have thrown')
    } catch (error) {
      const msg = (error as Error).message
      expect(msg).to.include('running')
      expect(msg).to.include('closed')
      expect(msg).to.include('blocked') // one of the allowed targets
    }
  })

  it('self-transition is allowed (planning -> planning)', () => {
    const result = transition(makeRun('planning'), 'planning')
    expect(result.status).to.equal('planning')
  })

  it('transition bumps updated_unix', () => {
    const run = makeRun('queued', {updated_unix: 1})
    const result = transition(run, 'running')
    assert.isAbove(result.updated_unix, 1)
  })

  it('transition returns a new object (does not mutate original)', () => {
    const run = makeRun('queued')
    const result = transition(run, 'running')
    assert.notEqual(result, run)
    expect(run.status).to.equal('queued')
  })

  it('all 7 statuses from SPEC §3 are represented in ALLOWED_TRANSITIONS', () => {
    const expected: RunStatus[] = ['awaiting-approval', 'blocked', 'closed', 'planning', 'pr-open', 'queued', 'running']
    assert.deepEqual(Object.keys(ALLOWED_TRANSITIONS).sort(), expected)
  })
})
