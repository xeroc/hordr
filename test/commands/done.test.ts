/* eslint-disable camelcase -- task_id mirrors the JSON contract the agent parses */
import {expect} from 'chai'

import {mapDoneResponse} from '../../src/commands/done.js'

describe('commands/done (inline response mapping)', () => {
  it('200 + next bean → exit 0, body JSON to stdout for the agent to parse', () => {
    const out = mapDoneResponse({
      body: {next: {id: 'hordr-C', prompt: 'do C', role: 'tester'}, ok: true, task_id: 'hordr-1'},
      status: 200,
    })
    expect(out.exitCode).to.equal(0)
    expect(JSON.parse(out.stdout)).to.deep.equal({
      next: {id: 'hordr-C', prompt: 'do C', role: 'tester'},
      ok: true,
      task_id: 'hordr-1',
    })
  })

  it('200 + next:null (epic done, no continuation) → exit 0', () => {
    const out = mapDoneResponse({body: {next: null, ok: true, task_id: 'hordr-1'}, status: 200})
    expect(out.exitCode).to.equal(0)
    expect(JSON.parse(out.stdout).next).to.be.null
  })

  it('409 (verify failed) → exit 2, structured error body still on stdout for the agent', () => {
    const out = mapDoneResponse({
      body: {error: 'bean hordr-1 status is in-progress', task_id: 'hordr-1'},
      status: 409,
    })
    expect(out.exitCode).to.equal(2)
    expect(JSON.parse(out.stdout).error).to.contain('in-progress')
  })

  it('400 (missing task_id) → exit 2', () => {
    const out = mapDoneResponse({body: {error: 'missing task_id'}, status: 400})
    expect(out.exitCode).to.equal(2)
  })
})
