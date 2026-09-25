/* eslint-disable camelcase -- MILESTONE_BEAN mirrors the on-disk snake_case JSON contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../../src/beans/client.js'
import FleetCreate from '../../../src/commands/fleet/create.js'
import {
  _resetShell as _resetDispatchShell,
  _setShellForTesting as _setDispatchShell,
} from '../../../src/dispatch/dispatch.js'
import {_resetShell as _resetWtShell, _setShellForTesting as _setWtShell} from '../../../src/herdr/worktree.js'
import {_resetGitRunner, _setGitRunnerForTesting, type GitRunner} from '../../../src/runtime.js'
import {openFleetDb} from '../../../src/storage/db.js'
import {_setProjectKeyResolverForTesting} from '../../../src/storage/project.js'

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
  const cmd = new FleetCreate(args, stubConfig)
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
  default_vcs: git
`

const MILESTONE_BEAN = {
  body: 'grow a fleet',
  created_at: '2026-01-01T00:00:00Z',
  etag: 'e1',
  id: 'hordr-ms1',
  path: 'hordr-ms1.md',
  priority: 'normal',
  slug: 'x',
  status: 'todo',
  title: 'MS',
  type: 'milestone',
  updated_at: '2026-01-01T00:00:00Z',
}

const TASK_BEAN = {...MILESTONE_BEAN, id: 'hordr-t1', type: 'task'}

describe('commands/fleet/create', () => {
  let configDir: string
  let dbFile: string
  let lockFile: string
  let origCwd: string
  let origDb: string | undefined
  let origLock: string | undefined
  let gitCalls: Array<{args: string[]; cwd: string}>
  let beanType: string
  let wtCreateCalls: string[][]
  let beanCalls: Array<{args: string[]; cwd?: string}>

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-fc-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    dbFile = path.join(configDir, 'hordr.db')
    lockFile = path.join(configDir, 'fleet.lock')
    origDb = process.env.HORDR_DB
    process.env.HORDR_DB = dbFile
    origLock = process.env.HORDR_LOCK
    process.env.HORDR_LOCK = lockFile
    origCwd = process.cwd()
    process.chdir(configDir)
    gitCalls = []
    beanType = 'milestone'
    wtCreateCalls = []
    beanCalls = []
    _setGitRunnerForTesting(((args, opts): void => {
      gitCalls.push({args, cwd: opts.cwd})
    }) as GitRunner)
    // Real repo: currentRef resolves the unborn/current branch without the runner seam.
    execFileSync('git', ['init', '-b', 'develop', configDir], {stdio: 'ignore'})
    writeFileSync(path.join(configDir, 'seed.txt'), 'x')
    execFileSync('git', ['add', '.'], {cwd: configDir, stdio: 'ignore'})
    execFileSync(
      'git',
      ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init'],
      {cwd: configDir, stdio: 'ignore'},
    )
    // Absolute key so resolveMainCheckout lands inside the sandbox.
    _setProjectKeyResolverForTesting(() => path.join(configDir, '.git'))
    _setBeansShell((_cmd: string, args: string[], opts?: {cwd?: string}) => {
      beanCalls.push({args, cwd: opts?.cwd})
      return JSON.stringify({...MILESTONE_BEAN, type: beanType})
    })
    // The check pass calls dispatch.ts's own beans seam (fetchEpics etc).
    // Mock it to report an epic-less milestone so scanFleet is a clean no-op.
    _setDispatchShell(() => JSON.stringify({bean: {children: []}}))
    _setWtShell((args) => {
      if (args[0] === 'worktree' && args[1] === 'create') {
        // Real herdr creates the worktree dir; the mock must too, or the check
        // pass quarantines the fleet (worktree-gone → broken).
        wtCreateCalls.push(args)
        const wtPath = configDir + '/ms-wt'
        mkdirSync(wtPath, {recursive: true})
        return JSON.stringify({result: {workspace: {workspace_id: 'w-ms'}, worktree: {path: wtPath}}})
      }

      return '{}'
    })
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    if (origLock === undefined) delete process.env.HORDR_LOCK
    else process.env.HORDR_LOCK = origLock
    rmSync(configDir, {force: true, recursive: true})
    _resetGitRunner()
    _setProjectKeyResolverForTesting(null)
    _resetBeansShell()
    _resetDispatchShell()
    _resetWtShell()
  })

  it('creates ms branch, registers the fleet active, then runs one check pass', async () => {
    const res = await invoke(['hordr-ms1'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/fleet hordr-ms1 created on hordr-ms1/)

    expect(gitCalls).to.have.length(0) // no git calls — herdr creates branch + worktree

    const db = openFleetDb()
    try {
      const row = db.prepare('SELECT status, branch, base_ref FROM fleets WHERE milestone_bean_id = ?').get('hordr-ms1') as {
        base_ref: string
        branch: string
        status: string
      }
      expect(row.status).to.equal('active')
      expect(row.branch).to.equal('hordr-ms1')
      // Base = the invocation dir's current branch (develop), recorded for finish.
      expect(row.base_ref).to.equal('develop')
    } finally {
      db.close()
    }

    // herdr got --base develop (the sandbox repo's current branch)
    expect(wtCreateCalls[0]).to.include('--base')
    expect(wtCreateCalls[0]).to.include('develop')
  })

  it('--json emits milestone, branch, projectKey', async () => {
    const res = await invoke(['hordr-ms1', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      branch: string
      milestone: string
      projectKey: string
    }
    expect(parsed).to.deep.equal({
      branch: 'hordr-ms1',
      milestone: 'hordr-ms1',
      projectKey: path.join(configDir, '.git'),
    })
  })

  it('refuses when the bean is not a milestone', async () => {
    beanType = 'task'
    _setBeansShell(() => JSON.stringify(TASK_BEAN))
    const res = await invoke(['hordr-t1'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not 'milestone'/)
    expect(gitCalls).to.have.length(0)
  })

  it('--base overrides the integration branch base', async () => {
    const res = await invoke(['hordr-ms1', '--base', 'main'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(wtCreateCalls[0]).to.include('main')
  })

  it('falls back to the main checkout when the invocation worktree cannot see the bean', async () => {
    // The reported bug: `fleet create` from a jj/git workspace whose working
    // copy predates the milestone bean → 'bean not found'. The bean must be
    // re-read from the main checkout.
    const wtDir = path.join(path.dirname(configDir), `${path.basename(configDir)}-wt`)
    execFileSync('git', ['worktree', 'add', wtDir, '-b', 'spike'], {cwd: configDir, stdio: 'ignore'})
    _setProjectKeyResolverForTesting(null) // real resolution: worktree → main .git
    _setBeansShell((_cmd: string, args: string[], opts?: {cwd?: string}) => {
      beanCalls.push({args, cwd: opts?.cwd})
      if (opts?.cwd === wtDir) throw new Error('bean not found: hordr-ms1')
      return JSON.stringify(MILESTONE_BEAN)
    })
    process.chdir(wtDir)

    try {
      const res = await invoke(['hordr-ms1'])

      expect(res.error, res.error?.message).to.be.undefined
      // First read fails in the workspace; the retry reaches the main checkout.
      const cwds = beanCalls.filter((c) => c.args[0] === 'show').map((c) => c.cwd)
      expect(cwds).to.include(configDir)
      // Base = the workspace's own branch; ms workspace created from the MAIN checkout.
      expect(wtCreateCalls[0]).to.include('spike')
    } finally {
      process.chdir(configDir)
      rmSync(wtDir, {force: true, recursive: true})
    }
  })

  it('errors when milestone id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
