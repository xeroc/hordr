import {expect} from 'chai'

import {type GitFn, mergeBranch, mergeMilestoneToPrimary} from '../../src/dispatch/merge.js'

describe('dispatch/merge', () => {
  describe('mergeBranch', () => {
    it('merges directly when already on target (no stash/checkout needed)', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})

      expect(result.conflict).to.be.false
      // Just a merge — no stash, no checkout
      expect(calls).to.have.length(1)
      expect(calls[0]).to.deep.equal(['merge', '--no-ff', 'epic-branch'])
    })

    it('returns conflict:true when merge fails', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        if (args[0] === 'merge' && args.includes('--no-ff')) {
          throw new Error('CONFLICT (content): Merge conflict in src/foo.ts')
        }
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})

      expect(result.conflict).to.be.true
      expect(result.message).to.match(/CONFLICT/)
    })

    it('falls through to checkout+merge when direct merge fails (wrong branch)', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
        // First merge fails (wrong branch) — checkout + retry merge succeeds
        if (args[0] === 'merge' && calls.length === 1) throw new Error('not on the right branch')
      }

      const result = mergeBranch({cwd: '/repo', source: 'x', target: 'ms/y'}, {git})

      expect(result.conflict).to.be.false
      // First merge failed → stash, checkout, second merge
      expect(calls.some((c) => c[0] === 'checkout' && c[1] === 'ms/y')).to.be.true
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
    it('attempts merge of ms/<id>', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeMilestoneToPrimary({cwd: '/repo', milestoneId: 'hordr-nh1h', primaryBranch: 'develop'}, {git})

      // mergeBranch is called with source ms/hordr-nh1h
      expect(calls.some((c) => c[0] === 'merge' && c.includes('ms/hordr-nh1h'))).to.be.true
    })
  })
})
