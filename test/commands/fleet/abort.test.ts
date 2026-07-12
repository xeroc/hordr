/* eslint-disable camelcase -- herdr envelopes mirror snake_case JSON */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import FleetAbort from '../../../src/commands/fleet/abort.js'
import {
  _resetShell as _resetWtShell,
  _setShellForTesting as _setWtShell,
  HerdrError,
  type ShellFn,
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
  const cmd = new FleetAbort(args, stubConfig)
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

function seedFleetWithLane(dbFile: string): void {
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
    ).run(PK, MS, '/repo', MS, 'active', '2026-01-01T00:00:00Z')
    db.prepare(
      `INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, pane_id, status, current_task_bean_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(PK, MS, 'epic-a', '/wt/epic-a', 'ms/x/epic-a', null, 'active', null, '2026-01-01T00:00:00Z')
  } finally {
    db.close()
  }
}

describe('commands/fleet/abort', () => {
  let configDir: string
  let dbFile: string
  let origCwd: string
  let origDb: string | undefined
  let wtCalls: string[][]
  let gitCalls: string[][]
  let openThrows: boolean

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-fab-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    dbFile = path.join(configDir, 'hordr.db')
    origDb = process.env.HORDR_DB
    process.env.HORDR_DB = dbFile
    origCwd = process.cwd()
    process.chdir(configDir)
    wtCalls = []
    gitCalls = []
    openThrows = false
    _setWtShell(((args): string => {
      wtCalls.push(args)
      if (args[1] === 'open') {
        if (openThrows) {
          throw new HerdrError(
            `herdr worktree open failed: (stderr: ${JSON.stringify({error: {code: 'worktree_not_found', message: 'gone'}})})`,
          )
        }

        return JSON.stringify({result: {workspace: {workspace_id: 'wLane'}}})
      }

      if (args[1] === 'remove') return JSON.stringify({result: {ok: true}})
      throw new Error(`unexpected herdr call: ${args.join(' ')}`)
    }) as ShellFn)
    _setGitRunnerForTesting(((args): void => {
      gitCalls.push(args)
    }) as GitRunner)
    _setProjectKeyResolverForTesting(() => PK)
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    rmSync(configDir, {force: true, recursive: true})
    _resetWtShell()
    _resetGitRunner()
    _setProjectKeyResolverForTesting(null)
  })

  it('keeps worktrees by default, deletes rows', async () => {
    seedFleetWithLane(dbFile)
    const res = await invoke([MS])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/aborted fleet/)
    expect(res.stdout).to.match(/worktrees kept/)
    // no worktree removal, no branch deletion
    expect(wtCalls.filter((c) => c[1] === 'remove')).to.have.length(0)
    expect(gitCalls).to.have.length(0)

    const db = openFleetDb(dbFile)
    try {
      expect(db.prepare('SELECT * FROM fleets').get()).to.be.undefined
    } finally {
      db.close()
    }
  })

  it('--force removes the lane worktree and deletes the ms branch', async () => {
    seedFleetWithLane(dbFile)
    const res = await invoke([MS, '--force'])

    expect(res.error, res.error?.message).to.be.undefined
    // open (resolve workspace) + remove
    expect(wtCalls.filter((c) => c[1] === 'remove')).to.have.length(2)
    expect(wtCalls.find((c) => c[1] === 'remove')).to.include.members(['--workspace', 'wLane'])
    // ms branch force-deleted
    expect(gitCalls).to.deep.equal([
      ['branch', '-D', MS],
      ['branch', '-D', `${MS}-wt`],
    ])
  })

  it('--force tolerates an already-gone worktree', async () => {
    seedFleetWithLane(dbFile)
    openThrows = true
    const res = await invoke([MS, '--force'])

    expect(res.error, res.error?.message).to.be.undefined
    // open failed (gone) → no remove call, but ms branch still deleted + rows removed
    expect(wtCalls.filter((c) => c[1] === 'remove')).to.have.length(0)
    expect(gitCalls).to.deep.equal([
      ['branch', '-D', MS],
      ['branch', '-D', `${MS}-wt`],
    ])
  })

  it('refuses when no fleet exists', async () => {
    const res = await invoke([MS])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/no fleet for/)
  })

  it('errors when milestone id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
