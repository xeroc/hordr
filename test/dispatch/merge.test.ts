import {expect} from 'chai'

import {attemptMerge, type GitFn} from '../../src/dispatch/merge.js'

describe('dispatch/merge', () => {
  describe('attemptMerge (3-tier strategy)', () => {
    it('tier 1: succeeds with --ff-only when fast-forwardable', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      const result = attemptMerge({cwd: '/repo', source: 'epic-1', target: 'ms-1'}, {git})

      expect(result.status).to.equal('merged')
      // ff-only attempt
      const ffMerge = calls.find((c) => c[0] === 'merge' && c.includes('--ff-only'))
      expect(ffMerge).to.exist
      // no --no-ff fallback
      const noffMerge = calls.find((c) => c[0] === 'merge' && c.includes('--no-ff'))
      expect(noffMerge).to.be.undefined
    })

    it('tier 2: falls back to --no-ff when ff-only fails', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'merge' && args.includes('--ff-only')) throw new Error('Not possible to fast-forward')
      }

      const result = attemptMerge({cwd: '/repo', source: 'epic-1', target: 'ms-1'}, {git})

      expect(result.status).to.equal('merged')
      // both tiers attempted
      const ffMerge = calls.find((c) => c[0] === 'merge' && c.includes('--ff-only'))
      const noffMerge = calls.find((c) => c[0] === 'merge' && c.includes('--no-ff'))
      expect(ffMerge).to.exist
      expect(noffMerge).to.exist
      // ff-only attempted before no-ff
      expect(calls.indexOf(ffMerge!)).to.be.lessThan(calls.indexOf(noffMerge!))
    })

    it('tier 3: returns conflict and does NOT abort when --no-ff conflicts', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'merge' && args.includes('--ff-only')) throw new Error('Not possible to fast-forward')
        if (args[0] === 'merge' && args.includes('--no-ff')) throw new Error('CONFLICT in src/foo.ts')
      }

      const result = attemptMerge({cwd: '/repo', source: 'epic-1', target: 'ms-1'}, {git})

      expect(result.status).to.equal('conflict')
      // NO merge --abort (leave conflicted state for the agent)
      const abortCall = calls.find((c) => c[0] === 'merge' && c.includes('--abort'))
      expect(abortCall).to.be.undefined
      // NO restore (checkout back / stash pop) — worktree stays on target
      const checkoutBack = calls.find((c) => c[0] === 'checkout' && c[1] === '-')
      expect(checkoutBack).to.be.undefined
    })

    it('tier 1+2 success: restores the worktree (checkout back + stash pop)', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      attemptMerge({cwd: '/repo', source: 'epic-1', target: 'ms-1'}, {git})

      // stash push → checkout target → merge → checkout - → stash pop
      const checkoutBack = calls.find((c) => c[0] === 'checkout' && c[1] === '-')
      const stashPop = calls.find((c) => c[0] === 'stash' && c[1] === 'pop')
      expect(checkoutBack).to.exist
      expect(stashPop).to.exist
    })

    it('returns conflict when checkout target fails', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const git: GitFn = (args) => {
        if (args[0] === 'checkout' && args[1] === 'bad-branch') throw new Error('no such branch')
      }

      const result = attemptMerge({cwd: '/repo', source: 'x', target: 'bad-branch'}, {git})

      expect(result.status).to.equal('conflict')
      expect(result.status === 'conflict' && result.message).to.match(/checkout.*failed/)
    })
  })
})
