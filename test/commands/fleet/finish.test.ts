/* eslint-disable camelcase -- BEAN mirrors the on-disk snake_case JSON contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../../src/beans/client.js'
import FleetFinish from '../../../src/commands/fleet/finish.js'
import {
  _resetShell as _resetDispatchShell,
  _setShellForTesting as _setDispatchShell,
} from '../../../src/dispatch/dispatch.js'
import {_resetWhich, _setWhichForTesting as _setWhich} from '../../../src/harness/launcher.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../../src/herdr/pane.js'
import {
  _resetGit as _resetWorktreeGit,
  _resetShell as _resetWorktreeShell,
  _setGitForTesting as _setWorktreeGit,
  _setShellForTesting as _setWorktreeShell,
} from '../../../src/herdr/worktree.js'
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
  stdout: string
}

async function invoke(args: string[]): Promise<RunResult> {
  const cmd = new FleetFinish(args, stubConfig)
  const out: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk) => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  try {
    await cmd.run()
    return {stdout: out.join('')}
  } catch (error) {
    return {error: error as Error & {oclif?: {exit?: number}}, stdout: out.join('')}
  } finally {
    process.stdout.write = origOut
  }
}

const YAML = `
hordr:
  primary_branch: develop
`
const MS = 'hordr-ms1'
const PK = 'pk-test'

const MILESTONE_BEAN = {
  body: '',
  created_at: '2026-01-01T00:00:00Z',
  etag: 'e1',
  id: MS,
  path: 'x.md',
  priority: 'normal',
  slug: 'x',
  status: 'completed',
  title: 'MS',
  type: 'milestone',
  updated_at: '2026-01-01T00:00:00Z',
}

function seedFleet(dbFile: string, fleetStatus: string): void {
  const db = openFleetDb(dbFile)
  try {
    db.prepare('INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES (?, ?, ?, ?)').run(
      PK,
      '/c',
      '/b',
      '2026-01-01T00:00:00Z',
    )
    db.prepare(
      'INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(PK, MS, '/repo', `ms/${MS}`, fleetStatus, '2026-01-01T00:00:00Z')
  } finally {
    db.close()
  }
}

describe('commands/fleet/finish', () => {
  let configDir: string
  let dbFile: string
  let origCwd: string
  let origDb: string | undefined
  let gitCalls: Array<{args: string[]; cwd: string}>
  let gitThrows: boolean
  let milestoneStatus: string
  let epicStatuses: Array<{id: string; status: string}>

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-ffin-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    dbFile = path.join(configDir, 'hordr.db')
    origDb = process.env.HORDR_DB
    process.env.HORDR_DB = dbFile
    origCwd = process.cwd()
    process.chdir(configDir)
    gitCalls = []
    gitThrows = false
    milestoneStatus = 'completed'
    epicStatuses = [
      {id: 'epic-1', status: 'completed'},
      {id: 'epic-2', status: 'completed'},
    ]
    _setGitRunnerForTesting(((args, opts): void => {
      if (gitThrows && args[0] === 'merge') throw new Error('conflict')
      gitCalls.push({args, cwd: opts.cwd})
    }) as GitRunner)
    // removeWorktreeByPath uses its own git seam (herdr/worktree.ts) so it
    // doesn't roundtrip through runtime's GitRunner. Stub it to no-op so the
    // command's ms-worktree teardown doesn't shell out to real git.
    _setWorktreeGit(() => {})
    // spawnMerger calls openWorktree (worktree shell) + createTab/runInPane
    // (pane shell) + buildHarnessCommand (which). Stub them so the merger
    // agent spawn path works in the test env without real herdr/tmux.
    _setWorktreeShell(() => JSON.stringify({result: {branch: `ms/${MS}`, path: '/repo', workspace_id: 'ws-test'}}))
    _setPaneShell((args) => {
      if (args[0] === 'tab' && args[1] === 'create')
        return JSON.stringify({result: {root_pane: {pane_id: 'test-pane-1'}}})
      return ''
    })
    _setWhich(() => true)
    _setProjectKeyResolverForTesting(() => PK)
    _setBeansShell(() => JSON.stringify({...MILESTONE_BEAN, status: milestoneStatus}))
    _setDispatchShell((args) => {
      if (args.includes('query')) {
        return JSON.stringify({bean: {children: epicStatuses}})
      }

      throw new Error(`unexpected dispatch call: ${args.join(' ')}`)
    })
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    rmSync(configDir, {force: true, recursive: true})
    _resetGitRunner()
    _resetWorktreeGit()
    _resetWorktreeShell()
    _resetPaneShell()
    _resetWhich()
    _setProjectKeyResolverForTesting(null)
    _resetBeansShell()
    _resetDispatchShell()
  })

  it('merges ms/<id> into primary and deletes the fleet row', async () => {
    seedFleet(dbFile, 'active')
    const res = await invoke([MS])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(new RegExp(`finished fleet ${MS}`))
    expect(gitCalls.some((c) => c.args[0] === 'merge' && c.args.includes('hordr-ms1'))).to.be.true
    // merge now stashes first — check by content not position

    const db = openFleetDb(dbFile)
    try {
      const row = db.prepare('SELECT status FROM fleets WHERE milestone_bean_id = ?').get(MS)
      expect(row).to.be.undefined
    } finally {
      db.close()
    }
  })

  it('refuses when the milestone is not completed', async () => {
    seedFleet(dbFile, 'active')
    milestoneStatus = 'in-progress'
    _setBeansShell(() => JSON.stringify({...MILESTONE_BEAN, status: milestoneStatus}))
    const res = await invoke([MS])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not completed/)
    expect(gitCalls).to.have.length(0)
  })

  it('refuses when an epic is not completed', async () => {
    seedFleet(dbFile, 'active')
    epicStatuses = [
      {id: 'epic-1', status: 'completed'},
      {id: 'epic-2', status: 'in-progress'},
    ]
    const res = await invoke([MS])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not all epics/)
    expect(gitCalls).to.have.length(0)
  })

  it('spawns a merger agent on conflict and sets fleet to merging', async () => {
    seedFleet(dbFile, 'active')
    gitThrows = true
    const res = await invoke([MS])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/spawned merger agent/)
    const db = openFleetDb(dbFile)
    try {
      const row = db.prepare('SELECT status, pane_id FROM fleets WHERE milestone_bean_id = ?').get(MS) as
        | undefined
        | {pane_id: null | string; status: string}
      expect(row).to.exist
      expect(row!.status).to.equal('merging')
      expect(row!.pane_id).to.exist
    } finally {
      db.close()
    }
  })

  it('refuses when no fleet exists', async () => {
    const res = await invoke([MS])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/no fleet for/)
  })

  it('uses fleet.projectRoot as mainRepoCwd — cwd-independent (hordr-i6ed)', async () => {
    // seed fleet with a specific project_root
    const db = openFleetDb(dbFile)
    try {
      db.prepare('INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES (?, ?, ?, ?)').run(
        PK,
        '/c',
        '/b',
        '2026-01-01T00:00:00Z',
      )
      db.prepare(
        'INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, project_root, branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(PK, MS, '/repo', '/custom/main-repo', `ms/${MS}`, 'active', '2026-01-01T00:00:00Z')
    } finally {
      db.close()
    }

    const res = await invoke([MS])
    expect(res.error, res.error?.message).to.be.undefined
    // branch -d runs from mainRepoCwd, which must be the stored projectRoot
    const branchDelete = gitCalls.find((c) => c.args[0] === 'branch' && c.args[1] === '-d')
    expect(branchDelete, 'must run git branch -d').to.exist
    expect(branchDelete!.cwd).to.equal('/custom/main-repo')
  })

  it('errors when milestone id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
