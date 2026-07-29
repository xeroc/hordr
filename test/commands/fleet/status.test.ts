import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import FleetStatus from '../../../src/commands/fleet/status.js'
import {
  _resetShell as _resetDispatchShell,
  _setShellForTesting as _setDispatchShell,
} from '../../../src/dispatch/dispatch.js'
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

const MS2 = 'hordr-ms2'
const PK2 = 'pk-other'

/** Seed a second fleet under the same project, no lanes, created later. */
function seedSecondFleet(dbFile: string): void {
  const db = openFleetDb(dbFile)
  try {
    db.prepare(
      'INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(PK, MS2, '/repo2', `ms/${MS2}`, 'merging', '2026-01-02T00:00:00Z')
  } finally {
    db.close()
  }
}

/** Seed a fleet + lane under a *different* project (PK2), created latest. */
function seedOtherProject(dbFile: string): void {
  const db = openFleetDb(dbFile)
  try {
    db.prepare('INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES (?, ?, ?, ?)').run(
      PK2,
      '/c2',
      '/b2',
      '2026-01-01T00:00:00Z',
    )
    db.prepare(
      'INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(PK2, 'hordr-ms3', '/repo3', 'ms/hordr-ms3', 'active', '2026-01-03T00:00:00Z')
    db.prepare(
      `INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, pane_id, status, current_task_bean_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(PK2, 'hordr-ms3', 'epic-b', '/wt/epic-b', 'ms/x/epic-b', 'w2:p2', 'active', 'task-2', '2026-01-03T00:00:00Z')
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
    // default: no drafts under the milestone
    _setDispatchShell(() => JSON.stringify({bean: {children: []}}))
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (origDb === undefined) delete process.env.HORDR_DB
    else process.env.HORDR_DB = origDb
    rmSync(configDir, {force: true, recursive: true})
    _setProjectKeyResolverForTesting(null)
    _resetDispatchShell()
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

  it('lists drafts-awaiting-review (human)', async () => {
    seedRows(dbFile)
    _setDispatchShell(() =>
      JSON.stringify({
        bean: {
          children: [
            {
              children: [{id: 'hordr-d1', status: 'draft', title: 'Draft 1'}],
              id: 'epic-1',
              status: 'todo',
              title: 'E1',
            },
            {id: 'hordr-d2', status: 'draft', title: 'Draft 2'},
          ],
        },
      }),
    )

    const res = await invoke([MS])
    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/drafts awaiting review/)
    expect(res.stdout).to.match(/hordr-d1: Draft 1/)
    expect(res.stdout).to.match(/hordr-d2: Draft 2/)
  })

  it('emits drafts[] in --json', async () => {
    seedRows(dbFile)
    _setDispatchShell(() => JSON.stringify({bean: {children: [{id: 'hordr-d1', status: 'draft', title: 'Draft 1'}]}}))

    const res = await invoke([MS, '--json'])
    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {drafts: Array<{id: string; title: string}>}
    expect(parsed.drafts).to.deep.equal([{id: 'hordr-d1', title: 'Draft 1'}])
  })

  describe('no milestone given (list all fleets)', () => {
    it('lists every fleet for the project (human)', async () => {
      seedRows(dbFile)
      seedSecondFleet(dbFile)
      const res = await invoke([])

      expect(res.error, res.error?.message).to.be.undefined
      expect(res.stdout).to.match(new RegExp(`fleet ${MS} — active`))
      expect(res.stdout).to.match(new RegExp(`fleet ${MS2} — merging`))
      expect(res.stdout).to.match(/epic-a: active → task-1 \[w1:p1\]/)
    })

    it('lists fleets across ALL projects (human)', async () => {
      seedRows(dbFile)
      seedOtherProject(dbFile)
      const res = await invoke([])

      expect(res.error, res.error?.message).to.be.undefined
      expect(res.stdout).to.match(new RegExp(`fleet ${MS} — active`))
      expect(res.stdout).to.match(/fleet hordr-ms3 — active/)
      // each fleet line shows its project key
      expect(res.stdout).to.match(new RegExp(`\\[${PK}\\]`))
      expect(res.stdout).to.match(new RegExp(`\\[${PK2}\\]`))
      // lanes resolve per-project (not the cwd projectKey)
      expect(res.stdout).to.match(/epic-a: active → task-1 \[w1:p1\]/)
      expect(res.stdout).to.match(/epic-b: active → task-2 \[w2:p2\]/)
    })

    it('notes when there are no fleets at all', async () => {
      // project row exists but has no fleets — still reports globally
      const db = openFleetDb(dbFile)
      try {
        db.prepare(
          'INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES (?, ?, ?, ?)',
        ).run(PK, '/c', '/b', '2026-01-01T00:00:00Z')
      } finally {
        db.close()
      }

      const res = await invoke([])
      expect(res.error, res.error?.message).to.be.undefined
      expect(res.stdout).to.match(/no fleets/)
    })

    it('--json emits an array of per-fleet objects', async () => {
      seedRows(dbFile)
      seedSecondFleet(dbFile)
      const res = await invoke(['--json'])

      expect(res.error, res.error?.message).to.be.undefined
      const parsed = JSON.parse(res.stdout.trim()) as Array<{lanes: unknown[]; milestone: string; status: string}>
      expect(parsed).to.have.length(2)
      const ids = parsed.map((f) => f.milestone)
      expect(ids).to.have.members([MS, MS2])
      const ms1 = parsed.find((f) => f.milestone === MS)!
      expect(ms1.status).to.equal('active')
      expect(ms1.lanes).to.have.length(1)
    })

    it('--json lists fleets across ALL projects with per-project lanes', async () => {
      seedRows(dbFile)
      seedOtherProject(dbFile)
      const res = await invoke(['--json'])

      expect(res.error, res.error?.message).to.be.undefined
      const parsed = JSON.parse(res.stdout.trim()) as Array<{
        lanes: Array<{epic: string}>
        milestone: string
        projectKey: string
      }>
      expect(parsed).to.have.length(2)
      const keys = parsed.map((f) => f.projectKey)
      expect(keys).to.have.members([PK, PK2])
      const other = parsed.find((f) => f.projectKey === PK2)!
      expect(other.lanes).to.have.length(1)
      expect(other.lanes[0].epic).to.equal('epic-b')
    })

    it('reports no fleets globally when none exist', async () => {
      const res = await invoke([])
      expect(res.error, res.error?.message).to.be.undefined
      expect(res.stdout).to.match(/no fleets/)
      expect(res.stdout).not.to.match(/for project/)
    })
  })
})
