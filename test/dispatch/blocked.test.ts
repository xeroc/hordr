/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
import {expect} from 'chai'

import {handleBlocked} from '../../src/dispatch/blocked.js'

describe('dispatch/blocked', () => {
  it('returns 200 and releases the lane when task is found', () => {
    let released: string | undefined
    const res = handleBlocked(
      {reason: 'deps not met', task_id: 'hordr-1234'},
      {
        releaseTask(id) {
          released = id
          return true
        },
      },
    )
    expect(res.status).to.equal(200)
    expect((res.body as {ok: boolean; task_id: string}).ok).to.be.true
    expect(released).to.equal('hordr-1234')
  })

  it('returns 400 when task_id is missing', () => {
    const res = handleBlocked({}, {releaseTask: () => true})
    expect(res.status).to.equal(400)
    expect((res.body as {error: string}).error).to.match(/task_id/)
  })

  it('returns 400 when body is null/undefined', () => {
    expect(handleBlocked(undefined, {releaseTask: () => true}).status).to.equal(400)
    expect(handleBlocked(null, {releaseTask: () => true}).status).to.equal(400)
  })

  it('returns 404 when no lane owns the task', () => {
    const res = handleBlocked({task_id: 'orphan-1'}, {releaseTask: () => false})
    expect(res.status).to.equal(404)
    expect((res.body as {error: string}).error).to.match(/no active lane/)
  })
})
