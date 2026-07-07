import {expect} from 'chai'

import {resolveProjectKey} from '../../src/storage/project.js'

describe('storage/project', () => {
  describe('resolveProjectKey', () => {
    it('returns the git-common-dir path (stable across worktrees)', () => {
      // This test runs in the real repo; the key is whatever git-common-dir says.
      const key = resolveProjectKey()
      expect(key).to.be.a('string')
      expect(key).to.match(/\.git$/)
    })

    it('is deterministic (same value on repeated calls)', () => {
      expect(resolveProjectKey()).to.equal(resolveProjectKey())
    })
  })
})
