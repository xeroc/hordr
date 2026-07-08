
import {expect} from 'chai'

import {createMilestoneBranch, type GitFn, milestoneBranchName} from '../../src/dispatch/branch.js'

describe('dispatch/branch', () => {
  describe('milestoneBranchName', () => {
    it('produces ms/<milestone-id>', () => {
      expect(milestoneBranchName('hordr-nh1h')).to.equal('ms/hordr-nh1h')
    })
  })

  describe('createMilestoneBranch', () => {
    it('creates ms/<id> from the primary branch', () => {
      const calls: Array<{args: string[]; cwd: string}> = []
      const git: GitFn = (args, opts) => {
        calls.push({args, cwd: opts.cwd})
      }

      createMilestoneBranch({cwd: '/repo', milestoneId: 'hordr-nh1h', primaryBranch: 'develop'}, {git})

      expect(calls).to.have.length(1)
      expect(calls[0]!.args).to.deep.equal(['branch', 'ms/hordr-nh1h', 'develop'])
      expect(calls[0]!.cwd).to.equal('/repo')
    })

    it('uses main as primary when specified', () => {
      const calls: string[][] = []
      const git: GitFn = (args) => {
        calls.push(args)
      }

      createMilestoneBranch({cwd: '.', milestoneId: 'hordr-1234', primaryBranch: 'main'}, {git})

      expect(calls[0]).to.deep.equal(['branch', 'ms/hordr-1234', 'main'])
    })
  })
})
