/* eslint-disable camelcase -- mirrors snake_case JSON contract from herdr CLI */
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_setBeansPresentForTesting} from '../src/beans/client.js'
import {
  _resetShell as _resetWtShell,
  _setHerdrPresentForTesting,
  _setShellForTesting as _setWtShell,
  HerdrError,
  type ShellFn,
} from '../src/herdr/worktree.js'
import {_resetGitRunner, _setGitRunnerForTesting, createDeps, type GitRunner} from '../src/runtime.js'

interface Call {
  args: string[]
  cwd?: string
}

let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (args, opts) => {
  const c: Call = {args, cwd: opts?.cwd}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected herdr call: ${args.join(' ')}`)
}

let gitCalls: Array<{args: string[]; cwd?: string}> = []
let gitResponder: ((g: {args: string[]; cwd?: string}) => void) | null = null
const mockGit: GitRunner = (args, opts) => {
  const g = {args, cwd: opts?.cwd}
  gitCalls.push(g)
  if (gitResponder) return gitResponder(g)
}

const OPEN_RESULT = {
  already_open: true,
  root_pane: {pane_id: 'wP:p1', tab_id: 'wP:t1', workspace_id: 'wP'},
  type: 'worktree_opened',
  workspace: {label: 'bean-hordr-999', workspace_id: 'wP'},
  worktree: {
    branch: 'hordr-999',
    open_workspace_id: 'wP',
    path: '/home/xeroc/.herdr/worktrees/repo/bean-hordr-999',
  },
}

const YAML = `
hordr:
  primary_branch: develop
`

describe('runtime / createDeps.createWorktree', () => {
  let configDir: string
  let origCwd: string

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-rt-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    origCwd = process.cwd()
    process.chdir(configDir)
    calls = []
    gitCalls = []
    responder = null
    gitResponder = null
    _setWtShell(mockShell)
    _setGitRunnerForTesting(mockGit)
    _setHerdrPresentForTesting(true)
    _setBeansPresentForTesting(true)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(configDir, {force: true, recursive: true})
    _resetWtShell()
    _resetGitRunner()
    _setHerdrPresentForTesting(true)
    _setBeansPresentForTesting(true)
  })

  it('passes --base develop (from config) by default', () => {
    responder = () => JSON.stringify({id: 'cli:worktree:create', result: OPEN_RESULT})
    const deps = createDeps()
    const info = deps.createWorktree('hordr-999')
    const a = calls[0].args
    expect(a).to.include('--base')
    expect(a).to.include('develop')
    expect(info).to.deep.equal({
      branch: 'hordr-999',
      path: '/home/xeroc/.herdr/worktrees/repo/bean-hordr-999',
      workspaceId: 'wP',
    })
  })

  it('passes --base from opts, overriding config', () => {
    responder = () => JSON.stringify({id: 'cli:worktree:create', result: OPEN_RESULT})
    const deps = createDeps()
    deps.createWorktree('hordr-999', {base: 'main'})
    const a = calls[0].args
    expect(a).to.include('--base')
    expect(a).to.include('main')
  })

  it("recovers via `worktree open` when create fails with 'already exists'", () => {
    let n = 0
    responder = (c) => {
      n++
      if (c.args[1] === 'create') {
        // Simulate the HerdrError that defaultShell wraps around git's
        // "a branch named '...' already exists" stderr.
        throw new HerdrError(
          `herdr worktree create --json --cwd ${c.cwd} --branch hordr-999 --base develop failed: ` +
            `Command failed: herdr worktree create (stderr: ${JSON.stringify({
              error: {
                code: 'worktree_create_failed',
                message:
                  "Preparing worktree (new branch 'hordr-999')\nfatal: a branch named 'hordr-999' already exists",
              },
              id: 'cli:worktree:create',
            })})`,
        )
      }

      return JSON.stringify({id: 'cli:worktree:open', result: OPEN_RESULT})
    }

    const deps = createDeps()
    const info = deps.createWorktree('hordr-999')
    expect(n).to.equal(2)
    expect(calls[0].args.slice(0, 2)).to.deep.equal(['worktree', 'create'])
    expect(calls[1].args.slice(0, 2)).to.deep.equal(['worktree', 'open'])
    expect(calls[1].args).to.include('--branch')
    expect(calls[1].args).to.include('hordr-999')
    expect(info).to.deep.equal({
      branch: 'hordr-999',
      path: '/home/xeroc/.herdr/worktrees/repo/bean-hordr-999',
      workspaceId: 'wP',
    })
  })

  it("re-throws when create fails for a reason other than 'already exists'", () => {
    responder = (c) => {
      if (c.args[1] === 'create') {
        throw new HerdrError(
          `herdr worktree create failed: Command failed: herdr worktree create (stderr: ${JSON.stringify({
            error: {code: 'worktree_create_failed', message: 'fatal: not a valid object name: bad-base'},
            id: 'cli:worktree:create',
          })})`,
        )
      }

      throw new Error('should not reach open')
    }

    const deps = createDeps()
    expect(() => deps.createWorktree('hordr-999')).to.throw(/worktree_create_failed/)
  })

  it("when open also fails with worktree_not_found: deletes the orphan branch via 'git branch -d' and retries create", () => {
    // The real-world shape: a previous create died after `git branch` succeeded
    // but before the worktree got linked. Branch exists, no worktree.
    let createN = 0
    responder = (c) => {
      if (c.args[1] === 'create') {
        createN++
        if (createN === 1) {
          throw new HerdrError(
            `herdr worktree create failed: Command failed: herdr worktree create (stderr: ${JSON.stringify({
              error: {
                code: 'worktree_create_failed',
                message: "fatal: a branch named 'hordr-999' already exists",
              },
              id: 'cli:worktree:create',
            })})`,
          )
        }

        // Retry succeeds.
        return JSON.stringify({id: 'cli:worktree:create', result: OPEN_RESULT})
      }

      if (c.args[1] === 'open') {
        throw new HerdrError(
          `herdr worktree open failed: Command failed: herdr worktree open (stderr: ${JSON.stringify({
            error: {code: 'worktree_not_found', message: 'worktree branch not found'},
            id: 'cli:worktree:open',
          })})`,
        )
      }

      throw new Error(`unexpected herdr call: ${c.args.join(' ')}`)
    }

    const deps = createDeps()
    const info = deps.createWorktree('hordr-999')

    // Sequence: create (fail) → open (fail) → git branch -d → create (succeed).
    expect(createN).to.equal(2)
    expect(calls.filter((c) => c.args[1] === 'create')).to.have.length(2)
    expect(calls.filter((c) => c.args[1] === 'open')).to.have.length(1)
    expect(gitCalls).to.have.length(1)
    expect(gitCalls[0].args).to.deep.equal(['branch', '-d', 'hordr-999'])
    expect(info).to.deep.equal({
      branch: 'hordr-999',
      path: '/home/xeroc/.herdr/worktrees/repo/bean-hordr-999',
      workspaceId: 'wP',
    })
  })

  it('when open fails for a reason other than worktree_not_found, re-throws the open error (does not delete branch)', () => {
    responder = (c) => {
      if (c.args[1] === 'create') {
        throw new HerdrError(
          `herdr worktree create failed: (stderr: ${JSON.stringify({
            error: {
              code: 'worktree_create_failed',
              message: "fatal: a branch named 'hordr-999' already exists",
            },
            id: 'cli:worktree:create',
          })})`,
        )
      }

      if (c.args[1] === 'open') {
        throw new HerdrError(
          `herdr worktree open failed: (stderr: ${JSON.stringify({
            error: {code: 'workspace_busy', message: 'tmux is in a weird state'},
            id: 'cli:worktree:open',
          })})`,
        )
      }

      throw new Error('unreachable')
    }

    const deps = createDeps()
    expect(() => deps.createWorktree('hordr-999')).to.throw(/workspace_busy/)
    expect(gitCalls).to.have.length(0)
  })

  it("when 'git branch -d' refuses (unmerged / checked-out), the git error propagates", () => {
    responder = (c) => {
      if (c.args[1] === 'create') {
        throw new HerdrError(
          `herdr worktree create failed: (stderr: ${JSON.stringify({
            error: {
              code: 'worktree_create_failed',
              message: "fatal: a branch named 'hordr-999' already exists",
            },
            id: 'cli:worktree:create',
          })})`,
        )
      }

      if (c.args[1] === 'open') {
        throw new HerdrError(
          `herdr worktree open failed: (stderr: ${JSON.stringify({
            error: {code: 'worktree_not_found', message: 'worktree branch not found'},
            id: 'cli:worktree:open',
          })})`,
        )
      }

      throw new Error('unreachable')
    }

    gitResponder = () => {
      // Simulate the wrapped HerdrError that defaultGitRunner produces.
      throw new HerdrError(
        "git branch -d hordr-999 failed: error: The branch 'hordr-999' is not fully merged.",
      )
    }

    const deps = createDeps()
    expect(() => deps.createWorktree('hordr-999')).to.throw(/not fully merged/)
  })
})
