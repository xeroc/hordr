/* eslint-disable camelcase -- fixtures mirror the herdr CLI JSON contract */
import {expect} from 'chai'

import {
  _resetGit,
  _resetShell,
  _setGitForTesting,
  _setShellForTesting,
  branchFor,
  closeWorkspace,
  createWorktree,
  type GitShellFn,
  HerdrError,
  openWorktree,
  removeWorktree,
  removeWorktreeByPath,
  type ShellFn,
} from '../../src/herdr/worktree.js'

interface Call {
  args: string[]
  cwd?: string
}

// Mock shell: records every invocation, delegates to a per-test responder.
let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (args, opts) => {
  const c: Call = {args, cwd: opts?.cwd}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected shell call: herdr ${args.join(' ')}`)
}

// Mock git runner: records calls, optionally throws with stderr.
let gitCalls: Call[] = []
let gitResponder: ((c: Call) => void) | null = null
const mockGit: GitShellFn = (args, opts) => {
  const c: Call = {args, cwd: opts?.cwd}
  gitCalls.push(c)
  if (gitResponder) gitResponder(c)
}

const CREATE_JSON = JSON.stringify({
  id: 'cli:worktree:create',
  result: {
    root_pane: {
      cwd: '/home/xeroc/.herdr/worktrees/wt-test/wttest',
      pane_id: 'wP:p1',
      tab_id: 'wP:t1',
      workspace_id: 'wP',
    },
    tab: {tab_id: 'wP:t1', workspace_id: 'wP'},
    type: 'worktree_created',
    workspace: {label: 'wttest', workspace_id: 'wP'},
    worktree: {
      branch: 'wttest',
      open_workspace_id: 'wP',
      path: '/home/xeroc/.herdr/worktrees/wt-test/wttest',
    },
  },
})

const REMOVE_JSON = JSON.stringify({
  id: 'cli:worktree:remove',
  result: {forced: false, path: '/x', type: 'worktree_removed', workspace_id: 'wP'},
})
const CLOSE_JSON = JSON.stringify({
  id: 'cli:workspace:close',
  result: {type: 'workspace_closed', workspace_id: 'wP'},
})

const OPEN_JSON = JSON.stringify({
  id: 'cli:worktree:open',
  result: {
    already_open: true,
    root_pane: {
      cwd: '/home/xeroc/.herdr/worktrees/wt-test/wttest',
      pane_id: 'wP:p1',
      tab_id: 'wP:t1',
      workspace_id: 'wP',
    },
    type: 'worktree_opened',
    workspace: {label: 'wttest', workspace_id: 'wP'},
    worktree: {
      branch: 'wttest',
      open_workspace_id: 'wP',
      path: '/home/xeroc/.herdr/worktrees/wt-test/wttest',
    },
  },
})

describe('herdr/worktree', () => {
  beforeEach(() => {
    calls = []
    gitCalls = []
    responder = null
    gitResponder = null
    _setShellForTesting(mockShell)
    _setGitForTesting(mockGit)
  })

  afterEach(() => {
    _resetShell()
    _resetGit()
  })

  it('createWorktree returns {workspace_id, branch, path, root_pane_id} (AC #1)', () => {
    responder = () => CREATE_JSON
    const info = createWorktree({branch: 'wttest', cwd: '/repo', label: 'wttest'})
    expect(info.workspace_id).to.equal('wP')
    expect(info.branch).to.equal('wttest')
    expect(info.path).to.equal('/home/xeroc/.herdr/worktrees/wt-test/wttest')
    expect(info.root_pane_id).to.equal('wP:p1')
  })

  it('createWorktree builds correct args (AC #1)', () => {
    responder = () => CREATE_JSON
    createWorktree({branch: 'wttest', cwd: '/repo'})
    const a = calls[0].args
    expect(a.slice(0, 3)).to.deep.equal(['worktree', 'create', '--json'])
    expect(a).to.include('--cwd')
    expect(a).to.include('/repo')
    expect(a).to.include('--branch')
    expect(a).to.include('wttest')
    expect(a).to.not.include('--focus')
    expect(a).to.not.include('--no-focus')
  })

  it('createWorktree rejects missing branch', () => {
    responder = () => CREATE_JSON
    expect(() => createWorktree({cwd: '/x'} as never)).to.throw(HerdrError, /branch is required/)
  })

  it('createWorktree rejects when neither cwd nor workspaceId', () => {
    responder = () => CREATE_JSON
    expect(() => createWorktree({branch: 'x'})).to.throw(HerdrError, /cwd or workspaceId/)
  })

  it('createWorktree rejects when both cwd and workspaceId', () => {
    responder = () => CREATE_JSON
    expect(() => createWorktree({branch: 'b', cwd: '/x', workspaceId: 'w'})).to.throw(HerdrError, /mutually exclusive/)
  })

  it('createWorktree propagates --focus / --no-focus', () => {
    responder = () => CREATE_JSON
    createWorktree({branch: 'b', cwd: '/r', focus: true})
    expect(calls[0].args).to.include('--focus')
    createWorktree({branch: 'b', cwd: '/r', focus: false})
    expect(calls[1].args).to.include('--no-focus')
  })

  it('throws HerdrError when herdr returns an error envelope', () => {
    responder = () => JSON.stringify({error: {code: 'bad_ref', message: 'no such ref'}, id: 'cli:worktree:create'})
    expect(() => createWorktree({branch: 'b', cwd: '/r'})).to.throw(HerdrError, /bad_ref: no such ref/)
  })

  it('removeWorktree does NOT pass --force by default (lets git refuse dirty trees)', () => {
    responder = () => REMOVE_JSON
    removeWorktree({workspaceId: 'wP'})
    expect(calls[0].args).to.deep.equal(['worktree', 'remove', '--workspace', 'wP', '--json'])
  })

  it('removeWorktree adds --force only when opts.force=true', () => {
    responder = () => REMOVE_JSON
    removeWorktree({force: true, workspaceId: 'wP'})
    expect(calls[0].args).to.deep.equal(['worktree', 'remove', '--workspace', 'wP', '--force', '--json'])
  })

  it('removeWorktree throws HerdrError on error envelope (AC #3)', () => {
    responder = () =>
      JSON.stringify({
        error: {code: 'not_linked_worktree', message: 'workspace is not a linked worktree checkout'},
        id: 'cli:worktree:remove',
      })
    expect(() => removeWorktree({workspaceId: 'wP'})).to.throw(HerdrError, /not_linked_worktree/)
  })

  it('branchFor returns the bean id (consistent with fleet lane naming) and throws on empty', () => {
    expect(branchFor('hordr-1234')).to.equal('hordr-1234')
    expect(() => branchFor('')).to.throw(HerdrError, /beanId is required/)
  })

  describe('openWorktree', () => {
    it('builds `worktree open --branch` args and parses result', () => {
      responder = () => OPEN_JSON
      const info = openWorktree({branch: 'wttest', cwd: '/repo'})
      expect(calls[0].args.slice(0, 3)).to.deep.equal(['worktree', 'open', '--json'])
      expect(calls[0].args).to.include('--cwd')
      expect(calls[0].args).to.include('/repo')
      expect(calls[0].args).to.include('--branch')
      expect(calls[0].args).to.include('wttest')
      expect(info.workspace_id).to.equal('wP')
      expect(info.branch).to.equal('wttest')
      expect(info.path).to.equal('/home/xeroc/.herdr/worktrees/wt-test/wttest')
      expect(info.root_pane_id).to.equal('wP:p1')
    })

    it('accepts --path instead of --branch', () => {
      responder = () => OPEN_JSON
      openWorktree({cwd: '/repo', path: '/repo/sub'})
      expect(calls[0].args).to.include('--path')
      expect(calls[0].args).to.include('/repo/sub')
      expect(calls[0].args).to.not.include('--branch')
    })

    it('rejects when neither branch nor path', () => {
      responder = () => OPEN_JSON
      expect(() => openWorktree({cwd: '/x'})).to.throw(HerdrError, /branch or path is required/)
    })

    it('rejects when neither cwd nor workspaceId', () => {
      responder = () => OPEN_JSON
      expect(() => openWorktree({branch: 'x'})).to.throw(HerdrError, /cwd or workspaceId/)
    })

    it('rejects when both cwd and workspaceId', () => {
      responder = () => OPEN_JSON
      expect(() => openWorktree({branch: 'b', cwd: '/x', workspaceId: 'w'})).to.throw(HerdrError, /mutually exclusive/)
    })

    it('throws HerdrError on error envelope', () => {
      responder = () => JSON.stringify({error: {code: 'not_found', message: 'no such branch'}, id: 'cli:worktree:open'})
      expect(() => openWorktree({branch: 'b', cwd: '/r'})).to.throw(HerdrError, /not_found: no such branch/)
    })
  })

  describe('removeWorktreeByPath', () => {
    it('calls `git worktree remove <path>` with NO --force', () => {
      removeWorktreeByPath('/wt/epic-a')
      expect(gitCalls).to.have.length(1)
      expect(gitCalls[0].args).to.deep.equal(['worktree', 'remove', '/wt/epic-a'])
      expect(gitCalls[0].args).to.not.include('--force')
    })

    it('forwards cwd to git so worktree remove works from non-git process cwd', () => {
      removeWorktreeByPath('/wt/epic-a', {cwd: '/repo/main'})
      expect(gitCalls).to.have.length(1)
      expect(gitCalls[0].cwd).to.equal('/repo/main')
    })

    it('does NOT roundtrip through herdr (no shell calls)', () => {
      removeWorktreeByPath('/wt/epic-a')
      expect(calls).to.have.length(0)
    })

    it('throws HerdrError on empty worktreePath', () => {
      expect(() => removeWorktreeByPath('')).to.throw(HerdrError, /worktreePath is required/)
    })

    it('tolerates an already-gone worktree (no throw)', () => {
      gitResponder = () => {
        const e = new Error('Command failed: git worktree remove')
        ;(e as Error & {stderr: string}).stderr = "fatal: '/wt/gone' is not a working tree"
        throw e
      }

      expect(() => removeWorktreeByPath('/wt/gone')).to.not.throw()
    })

    it('re-throws other git errors as HerdrError', () => {
      gitResponder = () => {
        const e = new Error('Command failed: git worktree remove')
        ;(e as Error & {stderr: string}).stderr = 'fatal: working tree contains modified or untracked files'
        throw e
      }

      expect(() => removeWorktreeByPath('/wt/dirty')).to.throw(HerdrError, /modified or untracked files/)
    })
  })

  describe('closeWorkspace', () => {
    it('runs `herdr workspace close <id>`', () => {
      responder = () => CLOSE_JSON
      closeWorkspace('wP')
      expect(calls[0].args).to.deep.equal(['workspace', 'close', 'wP'])
    })

    it('tolerates an already-gone workspace (workspace_not_found) — no throw', () => {
      responder = () => {
        const e = new Error('Command failed: herdr workspace close wP')
        ;(e as Error & {stderr: string}).stderr =
          '{"error":{"code":"workspace_not_found","message":"workspace wP not found"}}'
        throw e
      }

      expect(() => closeWorkspace('wP')).to.not.throw()
    })

    it('re-throws unexpected herdr errors', () => {
      responder = () => {
        throw new Error('herdr workspace close blew up')
      }

      expect(() => closeWorkspace('wP')).to.throw(/blew up/)
    })

    it('throws HerdrError on empty workspaceId', () => {
      responder = () => CLOSE_JSON
      expect(() => closeWorkspace('')).to.throw(HerdrError, /workspaceId is required/)
    })
  })
})
