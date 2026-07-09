import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import FleetStatus from '../../../src/commands/fleet/status.js'
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
  const cmd = new FleetStatus(args, stubConfig)
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

function seedRows(dbFile: string): void {
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
    ).run(PK, MS, '/repo', `ms/${MS}`, 'active', '2026-01-01T00:00:00Z')
    db.prepare(
      `INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, pane_id, status, current_task_bean_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(PK, MS, 'epic-a', '/wt/epic-a', 'ms/x/epic-a', 'w1:p1', 'active', 'task-1', '2026-01-01T00:00:00Z')
  } finally {
    db.close()
  }
}

describe('commands/fleet/status', () => {
  let configDir: string
  let dbFile: string
  let origCwd: string
  let origDb: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-fs-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    dbFile = path.join(configDir, 'hordr.db')
    origDb = process.env.HORDR_DB
    process.env.HORDR_DB = dbFile
    origCwd = process.cwd()
    process.chdir(configDir)
    _setProjectKeyResolverForTesting(() => PK)
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    rmSync(configDir, {force: true, recursive: true})
    _setProjectKeyResolverForTesting(null)
  })

  it('shows fleet state + lanes (human)', async () => {
    seedRows(dbFile)
    const res = await invoke([MS])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(new RegExp(`fleet ${MS} — active`))
    expect(res.stdout).to.match(/epic-a: active → task-1 \[w1:p1\]/)
  })

  it('--json emits milestone, status, branch, lanes[]', async () => {
    seedRows(dbFile)
    const res = await invoke([MS, '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      branch: string
      lanes: Array<{branch: string; currentTask: string; epic: string; pane: string; status: string}>
      milestone: string
      status: string
    }
    expect(parsed.milestone).to.equal(MS)
    expect(parsed.status).to.equal('active')
    expect(parsed.branch).to.equal(`ms/${MS}`)
    expect(parsed.lanes).to.have.length(1)
    expect(parsed.lanes[0]).to.deep.equal({
      branch: 'ms/x/epic-a',
      currentTask: 'task-1',
      epic: 'epic-a',
      pane: 'w1:p1',
      status: 'active',
      worktree: '/wt/epic-a',
    })
  })

  it('reports no lanes when the daemon has not created any', async () => {
    seedRows(dbFile)
    // wipe lanes
    const db = openFleetDb()
    try {
      db.prepare('DELETE FROM lanes').run()
    } finally {
      db.close()
    }

    const res = await invoke([MS])
    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/no lanes yet/)
  })

  it('errors when no fleet exists for the milestone', async () => {
    const res = await invoke([MS])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/no fleet for/)
  })
})
