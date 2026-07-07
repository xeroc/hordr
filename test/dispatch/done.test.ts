/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
import {expect} from 'chai'

import {handleDone} from '../../src/dispatch/done.js'

describe('dispatch/done', () => {
  it('returns 200 when bean is verified completed', () => {
    const res = handleDone({task_id: 'hordr-1234'}, {verifyCompleted: () => true})
    expect(res.status).to.equal(200)
    expect((res.body as {ok: boolean; task_id: string}).ok).to.be.true
    expect((res.body as {task_id: string}).task_id).to.equal('hordr-1234')
  })

  it('returns 400 when task_id is missing', () => {
    const res = handleDone({}, {verifyCompleted: () => true})
    expect(res.status).to.equal(400)
    expect((res.body as {error: string}).error).to.match(/task_id/)
  })

  it('returns 400 when body is null/undefined', () => {
    expect(handleDone(undefined, {verifyCompleted: () => true}).status).to.equal(400)
    expect(handleDone(null, {verifyCompleted: () => true}).status).to.equal(400)
  })

  it('returns 409 when bean is not actually completed (member lied)', () => {
    const res = handleDone({task_id: 'hordr-1234'}, {verifyCompleted: () => false})
    expect(res.status).to.equal(409)
    expect((res.body as {error: string}).error).to.match(/not completed/)
  })

  it('calls verifyCompleted with the task_id', () => {
    let captured: string | undefined
    handleDone(
      {task_id: 'hordr-5678'},
      {
        verifyCompleted(id) {
          captured = id
          return true
        },
      },
    )
    expect(captured).to.equal('hordr-5678')
  })
})
