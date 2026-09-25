import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import FleetAbort from '../../../src/commands/fleet/abort.js'
import {
  _resetGit as _resetWtGit,
  _resetShell as _resetWtShell,
  _setGitForTesting as _setWtGit,
  _setShellForTesting as _setWtShell,
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
  default_vcs: git
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
  let wtGitRemoves: string[][]

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
    wtGitRemoves = []
    _setWtGit((args) => {
      wtGitRemoves.push(args)
    })
    _setWtShell(((args): string => {
      wtCalls.push(args)
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
    _resetWtGit()
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
    // lane + ms working copies removed via the git worktree seam
    expect(wtGitRemoves.filter((c) => c[0] === 'worktree' && c[1] === 'remove')).to.have.length(2)
    // ms branch force-deleted via the adapter (force → -D)
    expect(gitCalls).to.deep.equal([['branch', '-D', MS]])
  })

  it('--force tolerates an already-gone worktree', async () => {
    seedFleetWithLane(dbFile)
    _setWtGit((args) => {
      wtGitRemoves.push(args)
      if (args[0] === 'worktree' && args[1] === 'remove') {
        const err = new Error('worktree remove failed') as {message: string; stderr?: string}
        err.stderr = "fatal: '/wt/epic-a' is not a working tree"
        throw err
      }
    })
    const res = await invoke([MS, '--force'])

    expect(res.error, res.error?.message).to.be.undefined
    // removals were attempted (and tolerated as already-gone)
    expect(wtGitRemoves).to.have.length(2)
    expect(gitCalls).to.deep.equal([['branch', '-D', MS]])
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
