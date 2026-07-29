/* eslint-disable camelcase -- mirrors snake_case JSON contracts from herdr/beans */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  _resetShell as _resetBeansShell,
  _setShellForTesting as _setBeansShell,
  type ShellOptions,
} from '../../src/beans/client.js'
import Finish from '../../src/commands/finish.js'
import {
  _resetShell as _resetWtShell,
  _setShellForTesting as _setWtShell,
  HerdrError,
  type ShellFn,
} from '../../src/herdr/worktree.js'
import {_resetGitRunner, _setGitRunnerForTesting, type GitRunner} from '../../src/runtime.js'

const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({failures: [], successes: []}),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

interface RunResult {
  error?: Error & {oclif?: {exit?: number}}
  stderr: string
  stdout: string
}

async function invoke(args: string[]): Promise<RunResult> {
  const cmd = new Finish(args, stubConfig)
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  process.stderr.write = (chunk) => {
    err.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  try {
    await cmd.run()
    return {stderr: err.join(''), stdout: out.join('')}
  } catch (error) {
    return {error: error as Error & {oclif?: {exit?: number}}, stderr: err.join(''), stdout: out.join('')}
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

const YAML = `
hordr:
  primary_branch: develop
  agents:
    implementer:
      harness: opencode
      persona: x
`

const COMPLETED_BEAN = {
  body: '## Requirement\n\nDo the thing.\n',
  created_at: '2026-01-01T00:00:00Z',
  etag: 'e1',
  id: 'hordr-1234',
  path: 'hordr-1234.md',
  priority: 'normal',
  slug: 'x',
  status: 'completed',
  title: 'T',
  type: 'task',
  updated_at: '2026-01-01T00:00:00Z',
}

const OPEN_RESULT = {
  workspace: {workspace_id: 'wP'},
  worktree: {branch: 'hordr-1234', path: '/wt/hordr-1234'},
}

describe('commands/finish', () => {
  let configDir: string
  let origCwd: string
  let wtCalls: string[][]
  let gitCalls: Array<{args: string[]; cwd?: string}>
  let beanCalls: Array<{args: string[]; cwd?: string}>
  let beanStatus: string
  let gitResponder: ((args: string[]) => void) | null

  const wtShell: ShellFn = (args) => {
    wtCalls.push(args)
    if (args[0] === 'worktree' && args[1] === 'open') return JSON.stringify({result: OPEN_RESULT})
    if (args[0] === 'worktree' && args[1] === 'remove') return JSON.stringify({result: {ok: true}})
    throw new Error(`unexpected herdr call: ${args.join(' ')}`)
  }

  const gitRunner: GitRunner = (args, opts) => {
    gitCalls.push({args, cwd: opts.cwd})
    if (gitResponder) gitResponder(args)
  }

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-fin-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    origCwd = process.cwd()
    process.chdir(configDir)
    wtCalls = []
    gitCalls = []
    beanCalls = []
    beanStatus = 'completed'
    gitResponder = null
    _setWtShell(wtShell)
    _setGitRunnerForTesting(gitRunner)
    _setBeansShell((_cmd: string, args: string[], opts: ShellOptions) => {
      beanCalls.push({args, cwd: opts.cwd})
      return JSON.stringify({...COMPLETED_BEAN, status: beanStatus})
    })
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(configDir, {force: true, recursive: true})
    _resetWtShell()
    _resetGitRunner()
    _resetBeansShell()
  })

  it('happy path: checks-out primary, merges bean branch, removes worktree, deletes branch (-d)', async () => {
    const res = await invoke(['hordr-1234'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/finished hordr-1234/)

    // git: checkout develop, merge hordr-1234, then safe-delete the branch
    expect(gitCalls).to.have.length(3)
    expect(gitCalls[0]!.args).to.deep.equal(['checkout', 'develop'])
    expect(gitCalls[1]!.args).to.deep.equal(['merge', '--no-ff', 'hordr-1234'])
    expect(gitCalls[2]!.args).to.deep.equal(['branch', '-d', 'hordr-1234'])
    expect(gitCalls[2]!.cwd).to.equal(process.cwd())

    // worktree open (to find workspace) then remove
    const openCall = wtCalls.find((c) => c[1] === 'open')
    expect(openCall).to.include.members(['--branch', 'hordr-1234'])
    const removeCall = wtCalls.find((c) => c[1] === 'remove')
    expect(removeCall).to.include.members(['--workspace', 'wP'])

    // bean status is read from the worktree checkout, not the main repo
    const showCall = beanCalls.find((c) => c.args[0] === 'show')
    expect(showCall?.cwd).to.equal('/wt/hordr-1234')
  })

  it('refuses when bean is not completed', async () => {
    beanStatus = 'in-progress'
    const res = await invoke(['hordr-1234'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not completed/)
    expect(gitCalls).to.have.length(0)
    expect(wtCalls.find((c) => c[1] === 'remove')).to.be.undefined
  })

  it('--json emits bean, branch, merged, removed, workspace, branchDeleted', async () => {
    const res = await invoke(['hordr-1234', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      bean: string
      branch: string
      branchDeleted: boolean
      merged: boolean
      removed: boolean
      workspace: string
    }
    expect(parsed).to.deep.equal({
      bean: 'hordr-1234',
      branch: 'hordr-1234',
      branchDeleted: true,
      merged: true,
      removed: true,
      workspace: 'wP',
    })
  })

  it('still merges when worktree is already gone (tolerant remove)', async () => {
    _setWtShell((args) => {
      wtCalls.push(args)
      if (args[0] === 'worktree' && args[1] === 'open') {
        throw new HerdrError(
          `herdr worktree open failed: (stderr: ${JSON.stringify({error: {code: 'worktree_not_found', message: 'nope'}})})`,
        )
      }

      throw new Error(`unexpected herdr call: ${args.join(' ')}`)
    })

    const res = await invoke(['hordr-1234'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(gitCalls).to.have.length(3)
    expect(gitCalls[2]!.args).to.deep.equal(['branch', '-d', 'hordr-1234'])
    expect(res.stdout).to.match(/no worktree for hordr-1234/)
    expect(res.stdout).to.match(/finished hordr-1234/)

    // no worktree → bean read from main repo (cwd unset), not a worktree path
    const showCall = beanCalls.find((c) => c.args[0] === 'show')
    expect(showCall?.cwd).to.be.undefined
  })

  it('tolerates branch -d failure: warns, marks branchDeleted false, still finishes', async () => {
    // Re-route git: checkout+merge succeed, but `branch -d` refuses (unmerged).
    gitResponder = (args) => {
      if (args[0] === 'branch' && args[1] === '-d') {
        throw new Error("error: The branch 'hordr-1234' is not fully merged.")
      }
    }

    const res = await invoke(['hordr-1234', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stderr).to.match(/branch 'hordr-1234' not deleted/)

    const parsed = JSON.parse(res.stdout.trim()) as {branchDeleted: boolean; merged: boolean}
    expect(parsed.merged).to.equal(true)
    expect(parsed.branchDeleted).to.equal(false)
  })

  it('errors when bean id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
