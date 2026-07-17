import {expect} from 'chai'

import {commitBeanChanges, type GitFn} from '../../src/dispatch/commit-beans.js'

/**
 * Records git calls and lets each call be configured to throw (simulating
 * non-zero exit) or succeed. Matches the GitFn contract used across dispatch/.
 */
type CallSpec = {args: string[]; throw?: boolean}

function makeGit(specs: CallSpec[], records: string[][]): GitFn {
  let i = 0
  return ((args: string[], _opts: {cwd: string}) => {
    records.push(args)
    const spec = specs[i++]
    if (spec && spec.throw) {
      const err = new Error(`git ${args.join(' ')} failed: (mock)`) as Error & {stderr?: string}
      err.stderr = '(mock stderr)'
      throw err
    }
  }) as GitFn
}

describe('dispatch/commit-beans', () => {
  it('stages the beans dir, then commits when something is staged (diff --cached --quiet throws = differences)', () => {
    const calls: string[][] = []
    const git = makeGit(
      [
        {args: ['add', '.beans']}, // stage
        {args: ['diff', '--cached', '--quiet'], throw: true}, // exit 1 = staged diffs exist
        {args: ['commit', '-m', 'chore(beans): rollup status changes']}, // commit
      ],
      calls,
    )

    const committed = commitBeanChanges({beansDir: '.beans', cwd: '/wt'}, {git})

    expect(committed).to.equal(true)
    expect(calls).to.deep.equal([
      ['add', '.beans'],
      ['diff', '--cached', '--quiet'],
      ['commit', '-m', 'chore(beans): rollup status changes'],
    ])
  })

  it('skips the commit when nothing is staged (diff --cached --quiet succeeds = no diffs) — idempotent on a clean worktree', () => {
    const calls: string[][] = []
    const git = makeGit(
      [
        {args: ['add', '.beans']}, // stage (no-op, nothing changed)
        {args: ['diff', '--cached', '--quiet']}, // exit 0 = nothing staged
      ],
      calls,
    )

    const committed = commitBeanChanges({beansDir: '.beans', cwd: '/wt'}, {git})

    expect(committed).to.equal(false)
    expect(calls).to.deep.equal([
      ['add', '.beans'],
      ['diff', '--cached', '--quiet'],
    ])
    expect(
      calls.some((c) => c[0] === 'commit'),
      'no commit call when nothing staged',
    ).to.equal(false)
  })

  it('propagates real git errors from git add (e.g., missing beans dir) — does NOT swallow', () => {
    const calls: string[][] = []
    const git = makeGit([{args: ['add', '.beans'], throw: true}], calls)

    expect(() => commitBeanChanges({beansDir: '.beans', cwd: '/wt'}, {git})).to.throw()
    expect(calls).to.deep.equal([['add', '.beans']])
  })

  it('propagates real git errors from git commit (e.g., pre-commit hook abort) — does NOT swallow', () => {
    const calls: string[][] = []
    const git = makeGit(
      [
        {args: ['add', '.beans']},
        {args: ['diff', '--cached', '--quiet'], throw: true},
        {args: ['commit', '-m', 'chore(beans): rollup status changes'], throw: true}, // hook aborted
      ],
      calls,
    )

    expect(() => commitBeanChanges({beansDir: '.beans', cwd: '/wt'}, {git})).to.throw()
    expect(calls).to.have.lengthOf(3)
  })

  it('all git calls are scoped to the given cwd (the worktree path)', () => {
    const calls: Array<{args: string[]; cwd: string}> = []
    const git: GitFn = (args: string[], opts: {cwd: string}) => {
      calls.push({args, cwd: opts.cwd})
      // no throws → diff --cached --quiet "succeeds" → nothing staged → skip commit
    }

    commitBeanChanges({beansDir: '.beans', cwd: '/wt/lane-1'}, {git})

    expect(calls.every((c) => c.cwd === '/wt/lane-1')).to.equal(true)
  })
})
