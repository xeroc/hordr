import {expect} from 'chai'

import type {TickResult} from '../../../src/dispatch/engine.js'

import {runFleetCheck} from '../../../src/commands/fleet/check.js'

/** A TickResult the mock scan returns; lets us assert scan actually ran. */
const SCAN_RESULT: TickResult = {advanced: 3, lanesCreated: 1}

/** A release fn factory that flips the flag when the lock is released. */
function recordingRelease(flag: {released: boolean}): () => void {
  return () => {
    flag.released = true
  }
}

describe('commands/fleet/check (runFleetCheck)', () => {
  it('runs scan under the lock and releases it on success', () => {
    const lock = {released: false}
    let scanCalls = 0
    const res = runFleetCheck(undefined, {
      acquireLock: () => recordingRelease(lock),
      scan() {
        scanCalls++
        return SCAN_RESULT
      },
    })

    expect(res.ran).to.be.true
    expect(res.result).to.deep.equal(SCAN_RESULT)
    expect(scanCalls).to.equal(1)
    expect(lock.released).to.be.true
  })

  it('skips (ran=false) and does NOT scan when the lock is held', () => {
    let scanCalls = 0
    const res = runFleetCheck(undefined, {
      acquireLock: () => null, // held by another run
      scan() {
        scanCalls++
        return SCAN_RESULT
      },
    })

    expect(res.ran).to.be.false
    expect(res.result).to.be.undefined
    expect(scanCalls).to.equal(0)
  })

  it('releases the lock even if scan throws (never deadlocks)', () => {
    const lock = {released: false}
    expect(() =>
      runFleetCheck(undefined, {
        acquireLock: () => recordingRelease(lock),
        scan() {
          throw new Error('scan blew up')
        },
      }),
    ).to.throw('scan blew up')
    expect(lock.released).to.be.true
  })
})
