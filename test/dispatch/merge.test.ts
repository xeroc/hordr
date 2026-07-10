import {expect} from 'chai'

import {type GitFn, mergeBranch, mergeMilestoneToPrimary} from '../../src/dispatch/merge.js'

describe('dispatch/merge', () => {
  describe('mergeBranch', () => {
    it('returns conflict:false on a clean merge (stash + checkout + merge + restore)', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})

      expect(result.conflict).to.be.false
      // stash, checkout, merge, checkout -, stash pop
      expect(calls[0]![0]).to.equal('stash')
      expect(calls[1]).to.deep.equal(['checkout', 'ms/hordr-ms1'])
      expect(calls[2]).to.deep.equal(['merge', '--no-ff', 'epic-branch'])
      expect(calls[3]![0]).to.equal('checkout')
      expect(calls[4]![0]).to.equal('stash')
    })

    it('returns conflict:true when git merge fails', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'merge') throw new Error('CONFLICT (content): Merge conflict in src/foo.ts')
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})

      expect(result.conflict).to.be.true
      expect(result.message).to.match(/CONFLICT/)
      // Should attempt merge --abort and restore
      expect(calls.some((c) => c[0] === 'merge' && c[1] === '--abort')).to.be.true
    })

    it('returns conflict:true when checkout fails', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const git: GitFn = (args) => {
        if (args[0] === 'checkout' && args[1] !== '-') throw new Error('error: Your local changes would be overwritten')
      }

      const result = mergeBranch({cwd: '/repo', source: 'x', target: 'y'}, {git})

      expect(result.conflict).to.be.true
      expect(result.message).to.match(/checkout/)
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
    it('merges ms/<id> into the primary branch', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      const result = mergeMilestoneToPrimary({cwd: '/repo', milestoneId: 'hordr-nh1h', primaryBranch: 'develop'}, {git})

      expect(result.conflict).to.be.false
      expect(calls.some((c) => c[0] === 'checkout' && c[1] === 'develop')).to.be.true
      expect(calls.some((c) => c[0] === 'merge' && c[1] === '--no-ff' && c[2] === 'ms/hordr-nh1h')).to.be.true
    })
  })
})
