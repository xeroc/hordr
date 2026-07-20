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

    it('creates projects, fleets, lanes tables', () => {
      applySchema(db)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
      const names = tables.map((t) => t.name)
      expect(names).to.include('projects')
      expect(names).to.include('fleets')
      expect(names).to.include('lanes')
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
        "INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES ('pk1', 'hordr-9999', '/wt', 'hordr-9999', 'active', '2026-01-01T00:00:00Z')",
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
  })
})
