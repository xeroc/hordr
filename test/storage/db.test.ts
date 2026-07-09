import Database from 'better-sqlite3'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {applySchema, openDb} from '../../src/storage/db.js'

describe('storage/db', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'hordr-db-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('openDb', () => {
    it('opens a database file and sets foreign_keys + busy_timeout pragmas', () => {
      const dbPath = path.join(dir, 'test.db')
      const db = openDb(dbPath)
      try {
        expect(db.pragma('foreign_keys', {simple: true})).to.equal(1)
        expect(db.pragma('busy_timeout', {simple: true})).to.equal(5000)
      } finally {
        db.close()
      }
    })

    it('can open an in-memory database (":memory:")', () => {
      const db = openDb(':memory:')
      try {
        expect(db.pragma('foreign_keys', {simple: true})).to.equal(1)
      } finally {
        db.close()
      }
    })
  })

  describe('applySchema', () => {
    let db: Database.Database

    beforeEach(() => {
      db = openDb(':memory:')
    })

    afterEach(() => {
      db.close()
    })

    it('creates projects, fleets, invocations tables', () => {
      applySchema(db)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
      const names = tables.map((t) => t.name)
      expect(names).to.include('projects')
      expect(names).to.include('fleets')
      expect(names).to.include('invocations')
    })

    it('is idempotent (running twice does not error)', () => {
      applySchema(db)
      expect(() => applySchema(db)).to.not.throw()
    })

    it('projects table has the documented columns', () => {
      applySchema(db)
      const cols = db.prepare('PRAGMA table_info(projects)').all() as {name: string}[]
      const names = cols.map((c) => c.name)
      expect(names).to.include.members(['project_key', 'config_path', 'beans_path', 'company_path', 'registered_at'])
    })

    it('fleets table has a composite PK (project_key, milestone_bean_id)', () => {
      applySchema(db)
      // Insert a project first (FK target)
      db.prepare(
        "INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES ('pk1', '/c', '/b', '2026-01-01T00:00:00Z')",
      ).run()
      // Insert a fleet
      db.prepare(
        "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt', 'milestone/hordr-9999', 'active', '2026-01-01T00:00:00Z')",
      ).run()
      // Composite PK: duplicate (project_key, milestone_bean_id) must fail
      expect(() =>
        db
          .prepare(
            "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt2', 'milestone/x', 'active', '2026-01-01T00:00:00Z')",
          )
          .run(),
      ).to.throw()
    })

    it('fleets.project_key FK rejects orphan inserts', () => {
      applySchema(db)
      expect(() =>
        db
          .prepare(
            "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('nonexistent', 'hordr-1', '/wt', 'milestone/x', 'active', '2026-01-01T00:00:00Z')",
          )
          .run(),
      ).to.throw()
    })

    it('invocations table records per-task agent runs with post-squash commit sha', () => {
      applySchema(db)
      db.prepare(
        "INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES ('pk1', '/c', '/b', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt', 'milestone/hordr-9999', 'active', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        `INSERT INTO invocations (project_key, fleet_milestone_bean_id, task_bean_id, role, pane_id, started_at, ended_at, commit_sha)
         VALUES ('pk1', 'hordr-9999', 'hordr-1234', 'implementer', 'w1:p1', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 'abc123')`,
      ).run()
      const row = db.prepare('SELECT role, commit_sha FROM invocations WHERE task_bean_id = ?').get('hordr-1234') as {
        commit_sha: string
        role: string
      }
      expect(row.role).to.equal('implementer')
      expect(row.commit_sha).to.equal('abc123')
    })

    it('creates a lanes table for per-epic worktree state', () => {
      applySchema(db)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
      expect(tables.map((t) => t.name)).to.include('lanes')
    })

    it('lanes table has the per-epic columns', () => {
      applySchema(db)
      const cols = db.prepare('PRAGMA table_info(lanes)').all() as {name: string}[]
      const names = cols.map((c) => c.name)
      expect(names).to.include.members([
        'project_key',
        'fleet_milestone_bean_id',
        'epic_bean_id',
        'worktree_path',
        'branch',
        'pane_id',
        'status',
        'current_task_bean_id',
        'created_at',
      ])
    })

    it('lanes FK rejects orphan inserts (project_key + fleet must exist)', () => {
      applySchema(db)
      expect(() =>
        db
          .prepare(
            "INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, status, created_at) VALUES ('nope', 'nope', 'epic-1', '/wt', 'ms/x/epic-1', 'pending', '2026-01-01T00:00:00Z')",
          )
          .run(),
      ).to.throw()
    })

    it('lanes composite PK prevents duplicate (project, fleet, epic)', () => {
      applySchema(db)
      db.prepare(
        "INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES ('pk1', '/c', '/b', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt', 'ms/hordr-9999', 'active', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        "INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', 'epic-1', '/wt1', 'ms/x/epic-1', 'active', '2026-01-01T00:00:00Z')",
      ).run()
      expect(() =>
        db
          .prepare(
            "INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', 'epic-1', '/wt2', 'ms/x/epic-1b', 'active', '2026-01-01T00:00:00Z')",
          )
          .run(),
      ).to.throw()
    })

    it('creates a bean_provenance table for dynamic-bean audit (ADR-0013)', () => {
      applySchema(db)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
      expect(tables.map((t) => t.name)).to.include('bean_provenance')
    })

    it('bean_provenance keeps the first creator (idempotent on spawned bean)', () => {
      applySchema(db)
      db.prepare(
        "INSERT INTO projects (project_key, config_path, beans_path, registered_at) VALUES ('pk1', '/c', '/b', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt', 'ms/hordr-9999', 'active', '2026-01-01T00:00:00Z')",
      ).run()
      db.prepare(
        "INSERT INTO bean_provenance (project_key, fleet_milestone_bean_id, created_by_task_bean_id, spawned_bean_id, recorded_at) VALUES ('pk1', 'hordr-9999', 'task-A', 'spawn-1', '2026-01-01T00:00:00Z')",
      ).run()
      // re-record with a different creator → ignored (INSERT OR IGNORE on PK)
      db.prepare(
        "INSERT OR IGNORE INTO bean_provenance (project_key, fleet_milestone_bean_id, created_by_task_bean_id, spawned_bean_id, recorded_at) VALUES ('pk1', 'hordr-9999', 'task-B', 'spawn-1', '2026-01-02T00:00:00Z')",
      ).run()
      const row = db
        .prepare('SELECT created_by_task_bean_id FROM bean_provenance WHERE spawned_bean_id = ?')
        .get('spawn-1') as {created_by_task_bean_id: string}
      expect(row.created_by_task_bean_id).to.equal('task-A')
    })
  })
})
