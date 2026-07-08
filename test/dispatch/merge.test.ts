import {expect} from 'chai'

import {type GitFn, mergeBranch} from '../../src/dispatch/merge.js'

describe('dispatch/merge', () => {
  describe('mergeBranch', () => {
    it('returns conflict:false on a clean merge', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const git: GitFn = () => {}

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})
      expect(result.conflict).to.be.false
    })

    it('returns conflict:true when git merge fails', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const git: GitFn = () => {
        throw new Error('CONFLICT (content): Merge conflict in src/foo.ts')
      }

      const result = mergeBranch({cwd: '/repo', source: 'epic-branch', target: 'ms/hordr-ms1'}, {git})
      expect(result.conflict).to.be.true
      expect(result.message).to.match(/CONFLICT/)
    })

    it('calls checkout target then merge --no-ff source', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      mergeBranch({cwd: '/repo', source: 'ms/ms1/epic-1', target: 'ms/ms1'}, {git})

      expect(calls[0]).to.deep.equal(['checkout', 'ms/ms1'])
      expect(calls[1]).to.deep.equal(['merge', '--no-ff', 'ms/ms1/epic-1'])
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
})
