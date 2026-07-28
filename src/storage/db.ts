/**
 * SQLite storage for the hordr daemon (ADR-0012).
 *
 * Holds process + placement + audit state that beans cannot express.
 * Work-state (bean status, assignments, tree) is NEVER mirrored here —
 * the daemon re-reads .beans/ in the worktree whenever it needs work-state.
 *
 * Schema is applied idempotently via CREATE TABLE IF NOT EXISTS. No migration
 * runner yet — add one when the schema actually changes (YAGNI).
 */
import Database from 'better-sqlite3'
import {mkdirSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * PRAGMAs applied on every connection. foreign_keys enforces FK constraints;
 *  busy_timeout lets SQLite retry for 5s before returning SQLITE_BUSY.
 */
const PRAGMAS = ['foreign_keys=ON', 'busy_timeout=5000'] as const

/** Open a database at the given path (file or ":memory:"), apply PRAGMAs. */
export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  for (const pragma of PRAGMAS) db.pragma(pragma)
  return db
}

/**
 * Default daemon DB path: $HOME/.hordr/hordr.db. Override with HORDR_DB.
 * Lives beside the daemon socket ($HORDR_SOCKET) so one dir holds all state.
 */
export function defaultDbPath(): string {
  return process.env.HORDR_DB ?? path.join(os.homedir(), '.hordr', 'hordr.db')
}

/**
 * Open the fleet DB at the default path, ensuring the schema. Used by the
 * fleet commands and the daemon. Idempotent — safe on every call.
 */
export function openFleetDb(dbPath?: string): Database.Database {
  const p = dbPath ?? defaultDbPath()
  if (p !== ':memory:') mkdirSync(path.dirname(p), {recursive: true})
  const db = openDb(p)
  applySchema(db)
  // Migrate older DBs: add workspace_id column to lanes if missing
  try {
    db.prepare('SELECT workspace_id FROM lanes LIMIT 0').all()
  } catch {
    db.exec('ALTER TABLE lanes ADD COLUMN workspace_id TEXT')
  }

  // Migrate older DBs: add pane_id column to fleets if missing (fleet merger agent tracking)
  try {
    db.prepare('SELECT pane_id FROM fleets LIMIT 0').all()
  } catch {
    db.exec('ALTER TABLE fleets ADD COLUMN pane_id TEXT')
  }

  return db
}

/** Apply the schema (idempotent). Safe to call on every daemon start. */
export function applySchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  project_key   TEXT PRIMARY KEY,
  config_path   TEXT NOT NULL,
  beans_path    TEXT NOT NULL,
  company_path  TEXT,
  registered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fleets (
  project_key       TEXT NOT NULL REFERENCES projects(project_key),
  milestone_bean_id TEXT NOT NULL,
  worktree_path     TEXT NOT NULL,
  branch            TEXT NOT NULL,
  status            TEXT NOT NULL,
  pane_id           TEXT,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (project_key, milestone_bean_id)
);

CREATE TABLE IF NOT EXISTS lanes (
  project_key             TEXT NOT NULL,
  fleet_milestone_bean_id TEXT NOT NULL,
  epic_bean_id            TEXT NOT NULL,
  worktree_path           TEXT NOT NULL,
  workspace_id            TEXT,
  branch                  TEXT NOT NULL,
  pane_id                 TEXT,
  status                  TEXT NOT NULL,
  current_task_bean_id    TEXT,
  created_at              TEXT NOT NULL,
  PRIMARY KEY (project_key, fleet_milestone_bean_id, epic_bean_id),
  FOREIGN KEY (project_key, fleet_milestone_bean_id) REFERENCES fleets(project_key, milestone_bean_id)
);
`
