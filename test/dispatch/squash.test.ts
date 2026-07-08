import {expect} from 'chai'

import {type GitFn, squashRollup} from '../../src/dispatch/squash.js'

describe('dispatch/squash', () => {
  it('runs add + commit --fixup + rebase --autosquash in order', () => {
    const calls: Array<{args: string[]; cwd: string}> = []
    const git: GitFn = (args, opts) => {
      calls.push({args, cwd: opts.cwd})
    }

    squashRollup({workCommitSha: 'abc123', worktreePath: '/wt/ms1'}, {git})

    expect(calls).to.have.length(3)
    // 1. git add .beans/
    expect(calls[0]!.args).to.deep.equal(['add', '.beans/'])
    expect(calls[0]!.cwd).to.equal('/wt/ms1')
    // 2. git commit --fixup=<sha>
    expect(calls[1]!.args).to.deep.equal(['commit', '--fixup=abc123'])
    // 3. git -c sequence.editor=: rebase -i --autosquash <sha>~1
    expect(calls[2]!.args).to.include.members(['-c', 'sequence.editor=:', 'rebase', '-i', '--autosquash', 'abc123~1'])
  })

  it('uses the worktree as cwd for all git operations', () => {
    const cwds: string[] = []
    const git: GitFn = (_args, opts) => {
      cwds.push(opts.cwd)
    }

    squashRollup({workCommitSha: 'def456', worktreePath: '/wt/custom'}, {git})
    expect(cwds.every((c) => c === '/wt/custom')).to.be.true
  })
})
