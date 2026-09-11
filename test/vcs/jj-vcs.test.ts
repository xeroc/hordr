import {expect} from 'chai'

import {_resetShell as _resetHerdrShell, _setShellForTesting as _setHerdrShell} from '../../src/herdr/worktree.js'
import {_resetShell, _setShellForTesting, createJjVcs, type JjShellFn} from '../../src/vcs/jj-vcs.js'

interface Call {
  args: string[]
  cwd: string
}

/** Recording shell mock: routes by argv, returns canned stdout. */
function mockShell(respond: (args: string[]) => string): {calls: Call[]; shell: JjShellFn} {
  const calls: Call[] = []
  const shell: JjShellFn = (args, opts) => {
    calls.push({args, cwd: opts.cwd})
    return respond(args)
  }

  return {calls, shell}
}

/** Capturing herdrCreate fake — no real herdr I/O. */
function herdrFake(): {
  calls: Array<{cwd: string; label: string}>
  create: (opts: {cwd: string; label: string}) => {workspaceId: string}
} {
  const calls: Array<{cwd: string; label: string}> = []
  return {
    calls,
    create(opts) {
      calls.push(opts)
      return {workspaceId: 'wFAKE'}
    },
  }
}

const CONFLICT_PROBE_ARGS = ['log', '-r', '@', '--no-graph', '-T', 'if(conflict, "1", "")']
const HEAD_PROBE_ARGS = ['log', '-r', '@', '--no-graph', '-T', 'if(empty, "E", "NE") ++ "|" ++ description']
const PARENTS_PROBE_ARGS = ['log', '-r', '@-', '--no-graph', '-T', String.raw`commit_id ++ "\n"`]
const HAS_NEW_COMMITS_PROBE_ARGS = ['log', '-r', '(::msA@ & ~(empty() & description(exact:""))) ~ ::@', '--no-graph', '-T', 'commit_id']

describe('vcs/jj-vcs', () => {
  afterEach(() => {
    _resetShell()
    _resetHerdrShell()
  })

  describe('projectKey', () => {
    it('returns the trimmed `jj git root` (the shared .git of the colocated repo)', () => {
      const {shell} = mockShell((args) => (args[0] === 'git' && args[1] === 'root' ? '/repos/x/.git\n' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().projectKey('/repos/x')).to.equal('/repos/x/.git')
    })

    it('throws a descriptive error when the cwd is not a colocated jj repository', () => {
      const {shell} = mockShell(() => {
        throw new Error('jj git root failed')
      })
      _setShellForTesting(shell)

      expect(() => createJjVcs().projectKey('/nope')).to.throw(/colocated jj repository/)
    })
  })

  describe('createWorkspace', () => {
    it('creates a sibling workspace from a bookmark/revset base and adopts a herdr workspace', () => {
      const herdr = herdrFake()
      const {calls, shell} = mockShell((args) => (args[0] === 'workspace' && args[1] === 'list' ? 'default: . abc 111 (empty)\n' : ''))
      _setShellForTesting(shell)

      const ref = createJjVcs({herdrCreate: herdr.create}).createWorkspace({
        base: 'ms-main',
        cwd: '/w/repo',
        name: 'laneA',
      })

      expect(ref).to.deep.equal({path: '/w/laneA', workspaceId: 'wFAKE'})
      expect(calls.map((c) => c.args)).to.deep.equal([
        ['workspace', 'list'],
        ['workspace', 'add', '/w/laneA', '--name', 'laneA', '-r', 'ms-main'],
      ])
      expect(herdr.calls).to.deep.equal([{cwd: '/w/laneA', label: 'laneA'}])
    })

    it('resolves base as a workspace head (`<base>@`) when a workspace by that name exists', () => {
      const herdr = herdrFake()
      const {calls, shell} = mockShell((args) =>
        args[0] === 'workspace' && args[1] === 'list' ? 'default: . abc 111\ncrosslane: ../crosslane xyz 222\n' : '',
      )
      _setShellForTesting(shell)

      createJjVcs({herdrCreate: herdr.create}).createWorkspace({base: 'crosslane', cwd: '/w/repo', name: 'laneB'})

      expect(calls).to.have.length(2)
      expect(calls[1].args).to.deep.equal(['workspace', 'add', '/w/laneB', '--name', 'laneB', '-r', 'crosslane@'])
      expect(herdr.calls).to.deep.equal([{cwd: '/w/laneB', label: 'laneB'}])
    })

    it('reuses an existing workspace by name (no `workspace add`, herdr adopts the existing path)', () => {
      const herdr = herdrFake()
      const {calls, shell} = mockShell((args) =>
        args[0] === 'workspace' && args[1] === 'list' ? 'default: . abc 111\nlaneA: ../laneA xyz 222\n' : '',
      )
      _setShellForTesting(shell)

      const ref = createJjVcs({herdrCreate: herdr.create}).createWorkspace({
        base: 'default',
        cwd: '/w/repo',
        name: 'laneA',
      })

      expect(ref).to.deep.equal({path: '/w/laneA', workspaceId: 'wFAKE'})
      expect(calls).to.have.length(1) // only the list probe
      expect(herdr.calls).to.deep.equal([{cwd: '/w/laneA', label: 'laneA'}])
    })
  })

  describe('findWorkspace', () => {
    it('returns the resolved path for a listed workspace (no herdr id to report)', () => {
      const {calls, shell} = mockShell((args) =>
        args[0] === 'workspace' && args[1] === 'list' ? 'default: . abc 111\nlaneA: ../laneA xyz 222\n' : '',
      )
      _setShellForTesting(shell)

      expect(createJjVcs().findWorkspace({cwd: '/w/repo', name: 'laneA'})).to.deep.equal({path: '/w/laneA'})
      expect(calls.map((c) => c.args)).to.deep.equal([['workspace', 'list']])
    })

    it('returns null for an unknown name', () => {
      _setShellForTesting(mockShell(() => 'default: . abc 111\n').shell)

      expect(createJjVcs().findWorkspace({cwd: '/w/repo', name: 'gone'})).to.be.null
    })
  })

  describe('removeWorkspace', () => {
    const GONE_DIR = '/tmp/hordr-jj-unit-definitely-missing' // never created — rmSync is a no-op

    it('forgets the workspace, removes the dir, and closes the herdr workspace', () => {
      const herdrShell: Array<{args: string[]}> = []
      _setHerdrShell((args) => {
        herdrShell.push({args})
        return '{"id":"cli:workspace:close","result":{"type":"ok"}}'
      })
      const {calls, shell} = mockShell(() => 'Forgot 1 workspaces.\n')
      _setShellForTesting(shell)

      createJjVcs().removeWorkspace({cwd: '/w/repo', name: 'laneA', path: GONE_DIR, workspaceId: 'wX1'})

      expect(calls.map((c) => c.args)).to.deep.equal([['workspace', 'forget', 'laneA']])
      expect(herdrShell.map((c) => c.args)).to.deep.equal([['workspace', 'close', 'wX1']])
    })

    it('tolerates an already-forgotten workspace (jj error swallowed, teardown continues)', () => {
      const herdrShell: Array<{args: string[]}> = []
      _setHerdrShell((args) => {
        herdrShell.push({args})
        return '{"id":"cli:workspace:close","result":{"type":"ok"}}'
      })
      const {shell} = mockShell(() => {
        throw new Error('jj workspace forget laneA failed')
      })
      _setShellForTesting(shell)

      expect(() =>
        createJjVcs().removeWorkspace({cwd: '/w/repo', name: 'laneA', path: GONE_DIR, workspaceId: 'wX1'}),
      ).to.not.throw()
      expect(herdrShell).to.have.length(1) // herdr close still attempted
    })

    it('skips the herdr close when no workspaceId is given', () => {
      let herdrCalls = 0
      _setHerdrShell(() => {
        herdrCalls++
        return '{"result":{"type":"ok"}}'
      })
      _setShellForTesting(mockShell(() => '').shell)

      createJjVcs().removeWorkspace({cwd: '/w/repo', name: 'laneA', path: GONE_DIR})

      expect(herdrCalls).to.equal(0)
    })
  })

  describe('dirtyPaths', () => {
    it('parses `jj diff --summary` lines (M/A/D prefix stripped)', () => {
      _setShellForTesting(mockShell(() => 'M a.txt\nA src/new.ts\nD gone/deep.md\n').shell)

      expect(createJjVcs().dirtyPaths('/w/repo')).to.deep.equal(['a.txt', 'src/new.ts', 'gone/deep.md'])
    })

    it('returns [] when clean', () => {
      _setShellForTesting(mockShell(() => '').shell)

      expect(createJjVcs().dirtyPaths('/w/repo')).to.deep.equal([])
    })

    it('fails loud with the probe sentinel when jj errors', () => {
      _setShellForTesting(
        mockShell(() => {
          throw new Error('jj diff --summary failed')
        }).shell,
      )

      expect(createJjVcs().dirtyPaths('/w/repo')).to.deep.equal(['<vcs probe failed>'])
    })
  })

  describe('conflictedFiles', () => {
    it('takes the path (first whitespace token) from `jj resolve --list`', () => {
      _setShellForTesting(mockShell(() => 'a.txt    2-sided conflict\nsrc/deep/b.ts    3-sided conflict\n').shell)

      expect(createJjVcs().conflictedFiles('/w/repo')).to.deep.equal(['a.txt', 'src/deep/b.ts'])
    })

    it('returns [] when resolve errors (clean tree — "No conflicts found" exits non-zero)', () => {
      _setShellForTesting(
        mockShell(() => {
          throw new Error('jj resolve --list failed (stderr: Error: No conflicts found)')
        }).shell,
      )

      expect(createJjVcs().conflictedFiles('/w/repo')).to.deep.equal([])
    })
  })

  describe('integrateHead', () => {
    it('clean merge: `new @ <src>@ -m`, probe, then park an empty head', () => {
      const {calls, shell} = mockShell(() => '')
      _setShellForTesting(shell)

      const result = createJjVcs().integrateHead({cwd: '/w/repo', message: 'merge laneA', source: 'laneA', target: 'ms'})

      expect(result).to.deep.equal({status: 'merged'})
      expect(calls.map((c) => c.args)).to.deep.equal([
        ['new', '@', 'laneA@', '-m', 'merge laneA'],
        CONFLICT_PROBE_ARGS,
        ['new'],
      ])
    })

    it('conflict: leaves the conflicted merge as head — NO trailing empty-head `new`', () => {
      const {calls, shell} = mockShell((args) => (args[0] === 'log' ? '1\n' : ''))
      _setShellForTesting(shell)

      const result = createJjVcs().integrateHead({cwd: '/w/repo', message: 'm', source: 'laneB', target: 'ms'})

      expect(result).to.deep.equal({status: 'conflict'})
      expect(calls.map((c) => c.args)).to.deep.equal([['new', '@', 'laneB@', '-m', 'm'], CONFLICT_PROBE_ARGS])
    })

    it('shell failure: aborted with the message, no probe, no park', () => {
      const {calls, shell} = mockShell(() => {
        throw new Error('jj new failed: revision not found')
      })
      _setShellForTesting(shell)

      const result = createJjVcs().integrateHead({cwd: '/w/repo', message: 'm', source: 'nope', target: 'ms'})

      expect(result.status).to.equal('aborted')
      expect(result.status === 'aborted' && result.message).to.match(/revision not found/)
      expect(calls).to.have.length(1)
    })
  })

  describe('mergeHeadIntoRef', () => {
    it('clean: merge ref+head, then move the bookmark to the merge and park a head', () => {
      const {calls, shell} = mockShell(() => '')
      _setShellForTesting(shell)

      const result = createJjVcs().mergeHeadIntoRef({cwd: '/w/lane', message: 'into ms', ref: 'ms-main', source: 'laneA'})

      expect(result).to.deep.equal({status: 'merged'})
      expect(calls.map((c) => c.args)).to.deep.equal([
        ['new', 'ms-main', '@', '-m', 'into ms'],
        CONFLICT_PROBE_ARGS,
        ['bookmark', 'set', 'ms-main', '-r', '@'],
        ['new'],
      ])
    })

    it('conflict: bookmark stays unmoved', () => {
      const {calls, shell} = mockShell((args) => (args[0] === 'log' ? '1' : ''))
      _setShellForTesting(shell)

      const result = createJjVcs().mergeHeadIntoRef({cwd: '/w/lane', message: 'm', ref: 'ms-main', source: 'laneA'})

      expect(result).to.deep.equal({status: 'conflict'})
      expect(calls.map((c) => c.args).some((a) => a[0] === 'bookmark')).to.be.false
    })

    it('shell failure: aborted with the message', () => {
      _setShellForTesting(
        mockShell(() => {
          throw new Error('jj new failed')
        }).shell,
      )

      const result = createJjVcs().mergeHeadIntoRef({cwd: '/w/lane', message: 'm', ref: 'ms-main', source: 'laneA'})

      expect(result.status).to.equal('aborted')
    })
  })

  describe('isIntegrationSettled', () => {
    it('true when @ is unconflicted with >= 2 parents (the settled merge)', () => {
      const {calls, shell} = mockShell((args) => (args.includes('@-') ? '11111\n22222\n' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().isIntegrationSettled({cwd: '/w/repo', source: 'x', target: 'y'})).to.be.true
      expect(calls.map((c) => c.args)).to.deep.equal([CONFLICT_PROBE_ARGS, PARENTS_PROBE_ARGS])
    })

    it('false when @ is still conflicted (parents not even probed)', () => {
      const {calls, shell} = mockShell((args) => (args.includes('if(conflict, "1", "")') ? '1' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().isIntegrationSettled({cwd: '/w/repo', source: 'x', target: 'y'})).to.be.false
      expect(calls).to.have.length(1)
    })

    it('false when the merge collapsed to a single parent (merger abandoned it)', () => {
      _setShellForTesting(mockShell((args) => (args.includes('@-') ? '11111\n' : '')).shell)

      expect(createJjVcs().isIntegrationSettled({cwd: '/w/repo', source: 'x', target: 'y'})).to.be.false
    })
  })

  describe('hasNewCommits (hordr-48ao)', () => {
    it('true when the lane lacks real commits from ms (probe output non-empty)', () => {
      const {calls, shell} = mockShell((args) => (args[0] === 'log' ? 'abc123\n' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().hasNewCommits({cwd: '/w/laneA', source: 'msA'})).to.be.true
      expect(calls.map((c) => c.args)).to.deep.equal([HAS_NEW_COMMITS_PROBE_ARGS])
    })

    it('false when ms holds nothing the lane lacks but parked empty heads', () => {
      _setShellForTesting(mockShell(() => '').shell)

      expect(createJjVcs().hasNewCommits({cwd: '/w/laneA', source: 'msA'})).to.be.false
    })

    it('true when the probe fails (fail open — the merge surfaces real errors)', () => {
      _setShellForTesting(
        mockShell(() => {
          throw new Error('jj log failed')
        }).shell,
      )

      expect(createJjVcs().hasNewCommits({cwd: '/w/laneA', source: 'msA'})).to.be.true
    })
  })

  describe('finalizeIntegration', () => {
    it('moves the target bookmark to @, then parks an empty head', () => {
      const {calls, shell} = mockShell(() => '')
      _setShellForTesting(shell)

      createJjVcs().finalizeIntegration({cwd: '/w/repo', target: 'ms-main'})

      expect(calls.map((c) => c.args)).to.deep.equal([['bookmark', 'set', 'ms-main', '-r', '@'], ['new']])
    })

    it('without a target it only parks the empty head', () => {
      const {calls, shell} = mockShell(() => '')
      _setShellForTesting(shell)

      createJjVcs().finalizeIntegration({cwd: '/w/repo'})

      expect(calls.map((c) => c.args)).to.deep.equal([['new']])
    })
  })

  describe('deleteRef', () => {
    it('deletes the bookmark (jj natively tolerates absent names)', () => {
      const {calls, shell} = mockShell(() => 'Deleted 1 bookmarks.\n')
      _setShellForTesting(shell)

      createJjVcs().deleteRef({cwd: '/w/repo', name: 'ms-main'})

      expect(calls.map((c) => c.args)).to.deep.equal([['bookmark', 'delete', 'ms-main']])
    })
  })

  describe('commitPending', () => {
    it('empty @ (resting state): nothing pending, no commit', () => {
      const {calls, shell} = mockShell(() => 'E|')
      _setShellForTesting(shell)

      expect(createJjVcs().commitPending({cwd: '/w/repo', message: 'rollup'})).to.be.false
      expect(calls.map((c) => c.args)).to.deep.equal([HEAD_PROBE_ARGS])
    })

    it('non-empty undescribed @: commits with the message', () => {
      const {calls, shell} = mockShell((args) => (args[0] === 'log' ? 'NE|' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().commitPending({cwd: '/w/repo', message: 'rollup'})).to.be.true
      expect(calls.map((c) => c.args)).to.deep.equal([HEAD_PROBE_ARGS, ['commit', '-m', 'rollup']])
    })

    it('already-described @: never clobbers the description', () => {
      const {calls, shell} = mockShell((args) => (args[0] === 'log' ? 'NE|work in flight' : ''))
      _setShellForTesting(shell)

      expect(createJjVcs().commitPending({cwd: '/w/repo', message: 'rollup'})).to.be.false
      expect(calls).to.have.length(1)
    })

    it('handles a `|` inside the description (splits on the first only)', () => {
      _setShellForTesting(mockShell((args) => (args[0] === 'log' ? 'NE|a|b' : '')).shell)

      expect(createJjVcs().commitPending({cwd: '/w/repo', message: 'rollup'})).to.be.false
    })
  })

  describe('stale working-copy recovery', () => {
    it('runs `workspace update-stale` and retries exactly once when jj reports a stale copy', () => {
      let stale = true
      const {calls, shell} = mockShell((args) => {
        if (args[0] === 'diff' && stale) {
          stale = false
          throw new Error('jj diff --summary failed (stderr: Error: The working copy is stale (not updated since operation 123))')
        }

        return 'M a.txt\n'
      })
      _setShellForTesting(shell)

      expect(createJjVcs().dirtyPaths('/w/repo')).to.deep.equal(['a.txt'])
      expect(calls.map((c) => c.args)).to.deep.equal([
        ['diff', '--summary'],
        ['workspace', 'update-stale'],
        ['diff', '--summary'],
      ])
    })

    it('rethrows non-stale failures untouched', () => {
      const {calls, shell} = mockShell(() => {
        throw new Error('jj diff --summary failed (stderr: Error: something else)')
      })
      _setShellForTesting(shell)

      expect(createJjVcs().dirtyPaths('/w/repo')).to.deep.equal(['<vcs probe failed>'])
      expect(calls).to.have.length(1)
    })
  })
})
