import {expect} from 'chai'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'

import {acquireFleetLock} from '../../src/storage/lock.js'

/** A fresh temp lock path per test so they never collide. Cleans up via afterEach. */
let dir = ''
function tmpLockPath(): string {
  dir = mkdtempSync('hordr-lock-test-')
  return `${dir}/fleet.lock`
}

/** A PID no live process owns (used to simulate a stale/crashed holder). */
const DEAD_PID = 999_999

describe('storage/lock', () => {
  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, {force: true, recursive: true})
      } catch {
        /* ignore */
      }
    }

    dir = ''
  })

  it('acquires when free, writing the current PID, and returns a release fn', () => {
    const path = tmpLockPath()
    const release = acquireFleetLock({path})
    expect(release).to.be.a('function')
    expect(readFileSync(path, 'utf8')).to.equal(String(process.pid))
    release!()
  })

  it('releases by removing the lockfile so a second acquire succeeds', () => {
    const path = tmpLockPath()
    const release = acquireFleetLock({path})
    release!()
    const second = acquireFleetLock({path})
    expect(second).to.be.a('function')
    second!()
  })

  it('returns null when the lock is held by a live process', () => {
    const path = tmpLockPath()
    // We are a live process holding the lock under our own PID.
    const release = acquireFleetLock({path})
    expect(release).to.be.a('function')
    const second = acquireFleetLock({path})
    expect(second).to.be.null
    release!()
  })

  it('steals a stale lock whose holder PID is dead (cron crash recovery)', () => {
    const path = tmpLockPath()
    // Simulate a crashed prior run: lockfile exists with a dead PID.
    writeFileSync(path, String(DEAD_PID))
    const release = acquireFleetLock({path})
    expect(release).to.be.a('function')
    expect(readFileSync(path, 'utf8')).to.equal(String(process.pid))
    release!()
  })

  it('release is idempotent (safe to call twice, e.g. exit hook + explicit)', () => {
    const path = tmpLockPath()
    const release = acquireFleetLock({path})!
    release()
    expect(() => release()).to.not.throw()
  })
})
