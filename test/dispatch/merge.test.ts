import {expect} from 'chai'

import {type GitFn, mergeBranch, mergeMilestoneToPrimary} from '../../src/dispatch/merge.js'

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
})
