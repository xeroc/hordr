/* eslint-disable camelcase -- MILESTONE_BEAN mirrors the on-disk snake_case JSON contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../../src/beans/client.js'
import FleetCreate from '../../../src/commands/fleet/create.js'
import {_setEnsureDaemonForTesting} from '../../../src/daemon/ensure.js'
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
  primary_branch: develop
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
  let origCwd: string
  let origDb: string | undefined
  let gitCalls: Array<{args: string[]; cwd: string}>
  let daemonCalls: number
  let beanType: string

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-fc-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    dbFile = path.join(configDir, 'hordr.db')
    origDb = process.env.HORDR_DB
    process.env.HORDR_DB = dbFile
    origCwd = process.cwd()
    process.chdir(configDir)
    gitCalls = []
    daemonCalls = 0
    beanType = 'milestone'
    _setGitRunnerForTesting(((args, opts): void => {
      gitCalls.push({args, cwd: opts.cwd})
    }) as GitRunner)
    _setProjectKeyResolverForTesting(() => 'pk-test')
    _setEnsureDaemonForTesting(async () => {
      daemonCalls++
      return {started: true}
    })
    _setBeansShell(() => JSON.stringify({...MILESTONE_BEAN, type: beanType}))
    _setWtShell((args) => {
      if (args[0] === 'worktree' && args[1] === 'create') {
        return JSON.stringify({result: {workspace: {workspace_id: 'w-ms'}, worktree: {path: configDir + '/ms-wt'}}})
      }

      return '{}'
    })
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    rmSync(configDir, {force: true, recursive: true})
    _resetGitRunner()
    _setProjectKeyResolverForTesting(null)
    _setEnsureDaemonForTesting(null)
    _resetBeansShell()
    _resetWtShell()
  })

  it('creates ms branch, registers fleet, ensures daemon', async () => {
    const res = await invoke(['hordr-ms1'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/fleet hordr-ms1 created on hordr-ms1/)

    expect(gitCalls).to.have.length(1)
    expect(gitCalls[0]!.args).to.deep.equal(['branch', 'hordr-ms1', 'develop'])
    expect(daemonCalls).to.equal(1)

    const db = openFleetDb()
    try {
      const row = db.prepare('SELECT status, branch FROM fleets WHERE milestone_bean_id = ?').get('hordr-ms1') as {
        branch: string
        status: string
      }
      expect(row.status).to.equal('active')
      expect(row.branch).to.equal('hordr-ms1')
    } finally {
      db.close()
    }
  })

  it('--json emits milestone, branch, daemonStarted, projectKey', async () => {
    const res = await invoke(['hordr-ms1', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      branch: string
      daemonStarted: boolean
      milestone: string
      projectKey: string
    }
    expect(parsed).to.deep.equal({
      branch: 'hordr-ms1',
      daemonStarted: true,
      milestone: 'hordr-ms1',
      projectKey: 'pk-test',
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
    expect(gitCalls[0]!.args).to.deep.equal(['branch', 'hordr-ms1', 'main'])
  })

  it('errors when milestone id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
