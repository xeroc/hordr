/**
 * Fleet + lane repository (ADR-0012, ADR-0014).
 *
 * Thin typed CRUD over the `projects`, `fleets`, and `lanes` tables. All
 * functions take an open `Database` so callers (commands, daemon) own the
 * connection lifecycle and tests use `:memory:`. Work-state (bean status,
 * assignments) is NEVER stored here — only process/placement state.
 */
import type Database from 'better-sqlite3'

// --- project ---

export interface ProjectRow {
  beansPath: string
  companyPath: null | string
  configPath: string
  projectKey: string
}

/** Insert the project if absent (INSERT OR IGNORE). FK target for fleets. */
export function ensureProject(db: Database.Database, row: ProjectRow): void {
  db.prepare(
    'INSERT OR IGNORE INTO projects (project_key, config_path, beans_path, company_path, registered_at) VALUES (?, ?, ?, ?, ?)',
  ).run(row.projectKey, row.configPath, row.beansPath, row.companyPath, new Date().toISOString())
}

/** Read the main repo path (beans_path) for a project. Returns undefined if not registered. */
export function getProjectPath(db: Database.Database, projectKey: string): string | undefined {
  const row = db.prepare('SELECT beans_path FROM projects WHERE project_key = ?').get(projectKey) as
    | undefined
    | {beans_path?: string}
  return row?.beans_path
}

// --- fleet ---

export interface FleetRow {
  branch: string
  createdAt: string
  milestoneBeanId: string
  projectKey: string
  status: string
  worktreePath: string
}

interface FleetDbRow {
  branch: string
  created_at: string
  milestone_bean_id: string
  project_key: string
  status: string
  worktree_path: string
}

function toFleetRow(r: FleetDbRow): FleetRow {
  return {
    branch: r.branch,
    createdAt: r.created_at,
    milestoneBeanId: r.milestone_bean_id,
    projectKey: r.project_key,
    status: r.status,
    worktreePath: r.worktree_path,
  }
}

export function registerFleet(db: Database.Database, row: FleetRow): void {
  db.prepare(
    'INSERT INTO fleets (project_key, milestone_bean_id, worktree_path, branch, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(row.projectKey, row.milestoneBeanId, row.worktreePath, row.branch, row.status, row.createdAt)
}

export function getFleet(db: Database.Database, projectKey: string, milestoneId: string): FleetRow | undefined {
  const r = db
    .prepare('SELECT * FROM fleets WHERE project_key = ? AND milestone_bean_id = ?')
    .get(projectKey, milestoneId) as FleetDbRow | undefined
  return r ? toFleetRow(r) : undefined
}

/** All fleets, optionally filtered by status (e.g. 'active'). Ordered oldest-first. */
export function listFleets(db: Database.Database, opts?: {status?: string}): FleetRow[] {
  const rows = opts?.status
    ? (db.prepare('SELECT * FROM fleets WHERE status = ? ORDER BY created_at').all(opts.status) as FleetDbRow[])
    : (db.prepare('SELECT * FROM fleets ORDER BY created_at').all() as FleetDbRow[])
  return rows.map((r) => toFleetRow(r))
}

export function deleteFleet(db: Database.Database, projectKey: string, milestoneId: string): void {
  db.prepare('DELETE FROM fleets WHERE project_key = ? AND milestone_bean_id = ?').run(projectKey, milestoneId)
}

/**
 * Update a fleet's status (e.g. 'active' → 'broken'). The daemon only scans
 * fleets with status 'active', so any other value quarantines it: scanFleet
 * uses this to retire a fleet whose milestone worktree has vanished, so one
 * missing worktree can't abort the tick for every other fleet.
 */
export function updateFleetStatus(
  db: Database.Database,
  projectKey: string,
  milestoneId: string,
  status: string,
): void {
  db.prepare('UPDATE fleets SET status = ? WHERE project_key = ? AND milestone_bean_id = ?').run(
    status,
    projectKey,
    milestoneId,
  )
}

// --- lane ---

export interface LaneRow {
  branch: string
  createdAt: string
  currentTaskBeanId: null | string
  epicBeanId: string
  fleetMilestoneBeanId: string
  paneId: null | string
  projectKey: string
  status: string
  workspaceId: null | string
  worktreePath: string
}

interface LaneDbRow {
  branch: string
  created_at: string
  current_task_bean_id: null | string
  epic_bean_id: string
  fleet_milestone_bean_id: string
  pane_id: null | string
  project_key: string
  status: string
  workspace_id: null | string
  worktree_path: string
}

function toLaneRow(r: LaneDbRow): LaneRow {
  return {
    branch: r.branch,
    createdAt: r.created_at,
    currentTaskBeanId: r.current_task_bean_id,
    epicBeanId: r.epic_bean_id,
    fleetMilestoneBeanId: r.fleet_milestone_bean_id,
    paneId: r.pane_id,
    projectKey: r.project_key,
    status: r.status,
    workspaceId: r.workspace_id,
    worktreePath: r.worktree_path,
  }
}

export function addLane(db: Database.Database, row: LaneRow): void {
  db.prepare(
    `INSERT INTO lanes (project_key, fleet_milestone_bean_id, epic_bean_id, worktree_path, workspace_id, branch, pane_id, status, current_task_bean_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.projectKey,
    row.fleetMilestoneBeanId,
    row.epicBeanId,
    row.worktreePath,
    row.workspaceId,
    row.branch,
    row.paneId,
    row.status,
    row.currentTaskBeanId,
    row.createdAt,
  )
}

export function listLanes(db: Database.Database, projectKey: string, milestoneId: string): LaneRow[] {
  const rows = db
    .prepare('SELECT * FROM lanes WHERE project_key = ? AND fleet_milestone_bean_id = ? ORDER BY created_at')
    .all(projectKey, milestoneId) as LaneDbRow[]
  return rows.map((r) => toLaneRow(r))
}

export function deleteLanes(db: Database.Database, projectKey: string, milestoneId: string): void {
  db.prepare('DELETE FROM lanes WHERE project_key = ? AND fleet_milestone_bean_id = ?').run(projectKey, milestoneId)
}

export function deleteLanesByEpic(db: Database.Database, loc: LaneLoc): void {
  db.prepare('DELETE FROM lanes WHERE project_key = ? AND fleet_milestone_bean_id = ? AND epic_bean_id = ?').run(
    loc.projectKey,
    loc.milestoneId,
    loc.epicId,
  )
}

export interface LaneLoc {
  epicId: string
  milestoneId: string
  projectKey: string
}

export function updateLaneStatus(db: Database.Database, loc: LaneLoc, status: string): void {
  db.prepare(
    'UPDATE lanes SET status = ? WHERE project_key = ? AND fleet_milestone_bean_id = ? AND epic_bean_id = ?',
  ).run(status, loc.projectKey, loc.milestoneId, loc.epicId)
}

/** Record the lane's stable pane id (created on first dispatch, reused after). */
export function setLanePane(db: Database.Database, loc: LaneLoc, paneId: string): void {
  db.prepare(
    'UPDATE lanes SET pane_id = ? WHERE project_key = ? AND fleet_milestone_bean_id = ? AND epic_bean_id = ?',
  ).run(paneId, loc.projectKey, loc.milestoneId, loc.epicId)
}

/** Set/clear the task the lane is currently working (null = idle). */
export function setLaneCurrentTask(db: Database.Database, loc: LaneLoc, taskId: null | string): void {
  db.prepare(
    'UPDATE lanes SET current_task_bean_id = ? WHERE project_key = ? AND fleet_milestone_bean_id = ? AND epic_bean_id = ?',
  ).run(taskId, loc.projectKey, loc.milestoneId, loc.epicId)
}

/** Find the lane that currently has this task assigned. Returns undefined if no lane owns it. */
export function findLaneByTask(db: Database.Database, taskId: string): LaneRow | undefined {
  const r = db.prepare('SELECT * FROM lanes WHERE current_task_bean_id = ?').get(taskId) as LaneDbRow | undefined
  return r === undefined ? undefined : toLaneRow(r)
}

/**
 * Count lanes with a running agent invocation (current_task_bean_id IS NOT
 * NULL) across every project and fleet — a single global ceiling. Backs the
 * `hordr fleet check --max-lanes` concurrency cap: an idle lane may not
 * dispatch a new agent once this many are already in flight.
 */
export function countActiveLanes(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM lanes WHERE current_task_bean_id IS NOT NULL').get() as {n: number}
  return row.n
}

export function setLaneWorktree(
  db: Database.Database,
  loc: LaneLoc,
  worktreePath: string,
  workspaceId: string,
  paneId: string,
): void {
  db.prepare(
    `UPDATE lanes SET worktree_path = ?, workspace_id = ?, pane_id = ?, current_task_bean_id = NULL
     WHERE project_key = ? AND fleet_milestone_bean_id = ? AND epic_bean_id = ?`,
  ).run(worktreePath, workspaceId, paneId, loc.projectKey, loc.milestoneId, loc.epicId)
}
