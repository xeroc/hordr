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
  created_at        TEXT NOT NULL,
  PRIMARY KEY (project_key, milestone_bean_id)
);

CREATE TABLE IF NOT EXISTS invocations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  project_key             TEXT NOT NULL,
  fleet_milestone_bean_id TEXT NOT NULL,
  task_bean_id            TEXT NOT NULL,
  role                    TEXT NOT NULL,
  pane_id                 TEXT,
  started_at              TEXT NOT NULL,
  ended_at                TEXT,
  commit_sha              TEXT
);

CREATE TABLE IF NOT EXISTS lanes (
  project_key             TEXT NOT NULL,
  fleet_milestone_bean_id TEXT NOT NULL,
  epic_bean_id            TEXT NOT NULL,
  worktree_path           TEXT NOT NULL,
  branch                  TEXT NOT NULL,
  pane_id                 TEXT,
  status                  TEXT NOT NULL,
  current_task_bean_id    TEXT,
  created_at              TEXT NOT NULL,
  PRIMARY KEY (project_key, fleet_milestone_bean_id, epic_bean_id),
  FOREIGN KEY (project_key, fleet_milestone_bean_id) REFERENCES fleets(project_key, milestone_bean_id)
);
`
