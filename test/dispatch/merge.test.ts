import {expect} from 'chai'

import {attemptMerge, type GitFn, mergeBranch, mergeMilestoneToPrimary} from '../../src/dispatch/merge.js'

describe('dispatch/merge', () => {
  describe('mergeBranch', () => {
    it('checks out target before merging (never merges on the wrong branch)', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'hordr-ms1'}, {git})

      expect(result.conflict).to.be.false
      // checkout target must happen before merge
      const checkoutIdx = calls.findIndex((c) => c[0] === 'checkout' && c[1] === 'hordr-ms1')
      const mergeIdx = calls.findIndex((c) => c[0] === 'merge' && c.includes('epic-branch'))
      expect(checkoutIdx).to.be.greaterThan(-1)
      expect(mergeIdx).to.be.greaterThan(-1)
      expect(checkoutIdx).to.be.lessThan(mergeIdx)
    })

    it('stashes before checkout and restores after', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeBranch({cwd: '/repo', source: 'x', target: 'y'}, {git})

      const stashIdx = calls.findIndex((c) => c[0] === 'stash')
      const checkoutIdx = calls.findIndex((c) => c[0] === 'checkout')
      expect(stashIdx).to.be.lessThan(checkoutIdx)
      // stash pop happens after merge
      const popIdx = calls.findIndex((c) => c[0] === 'stash' && c[1] === 'pop')
      const mergeIdx = calls.findIndex((c) => c[0] === 'merge')
      expect(mergeIdx).to.be.lessThan(popIdx)
    })

    it('uses --no-ff when ff:false', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeBranch({cwd: '/repo', ff: false, source: 'ms1', target: 'develop'}, {git})

      expect(calls.some((c) => c[0] === 'merge' && c.includes('--no-ff'))).to.be.true
    })

    it('allows fast-forward by default', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeBranch({cwd: '/repo', source: 'epic1', target: 'ms1'}, {git})

      const mergeCall = calls.find((c) => c[0] === 'merge')
      expect(mergeCall).to.exist
      expect(mergeCall).to.not.include('--no-ff')
    })

    it('returns conflict:true when merge fails', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'merge' && args[1] !== '--abort') {
          throw new Error('CONFLICT (content): Merge conflict in src/foo.ts')
        }
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'hordr-ms1'}, {git})

      expect(result.conflict).to.be.true
      expect(result.message).to.match(/CONFLICT/)
    })

    it('returns conflict:true when checkout target fails', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'checkout' && args[1] === 'nonexistent') throw new Error('no such branch')
      }

      const result = mergeBranch({cwd: '/repo', source: 'x', target: 'nonexistent'}, {git})

      expect(result.conflict).to.be.true
      expect(result.message).to.match(/checkout.*failed/)
    })

    it('uses the provided cwd for all git operations', () => {
      const cwds: string[] = []
      const git: GitFn = (_args, opts) => {
        cwds.push(opts.cwd)
      }

      mergeBranch({cwd: '/custom/repo', source: 'x', target: 'y'}, {git})
      expect(cwds.every((c) => c === '/custom/repo')).to.be.true
    })
  })

  describe('mergeMilestoneToPrimary', () => {
    it('checks out develop then merges ms branch with --no-ff', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeMilestoneToPrimary({cwd: '/repo', milestoneId: 'hordr-nh1h', primaryBranch: 'develop'}, {git})

      const checkoutIdx = calls.findIndex((c) => c[0] === 'checkout' && c[1] === 'develop')
      const mergeIdx = calls.findIndex((c) => c[0] === 'merge' && c.includes('hordr-nh1h') && c.includes('--no-ff'))
      expect(checkoutIdx).to.be.greaterThan(-1)
      expect(mergeIdx).to.be.greaterThan(-1)
      expect(checkoutIdx).to.be.lessThan(mergeIdx)
    })
  })

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
