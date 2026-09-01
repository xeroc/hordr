/**
 * Self-heal for a lane's herdr pane/workspace.
 *
 * A lane stores a `paneId` + `workspaceId` at creation time. Three things can
 * die independently:
 *   - the pane (agent exited, crash) → recreate a tab in the same workspace
 *   - the whole workspace (herdr restart, tmux session closed) → the stored
 *     workspace_id is now stale; `herdr tab create --workspace <stale>`
 *     returns `workspace_not_found`. Reattach the worktree to a fresh
 *     workspace via `herdr worktree open` (reuses the on-disk worktree +
 *     branch) and retry there.
 *
 * Pure function: all I/O is injected. Callers persist the returned ids.
 */
import type {CreateTabOpts, PaneInfo} from '../herdr/pane.js'

export interface PaneHealDeps {
  createTab: (opts: CreateTabOpts) => PaneInfo
  paneExists: (paneId: string) => boolean
  /**
   * Reattach a lane's working copy to a FRESH herdr workspace (the stored one
   * died). git: `herdr worktree open` (reuses the on-disk worktree + branch).
   * jj: `herdr workspace create --cwd <path>` (jj workspaces aren't herdr
   * worktrees — adopt the directory directly).
   */
  reattach: (lane: PaneHealLane, mainRepoCwd: string) => {workspaceId: string}
}

export interface PaneHealLane {
  branch: string
  epicBeanId: string
  paneId: null | string
  workspaceId: null | string
  worktreePath: string
}

export interface EnsurePaneResult {
  /** True when a dead workspace forced a reattach via `openWorktree`. */
  healed: boolean
  paneId: string
  /** Present only when healed — the new workspace id to persist. */
  workspaceId?: string
}

/** herdr's logical-error code for a workspace that no longer exists. */
const WORKSPACE_NOT_FOUND = /workspace_not_found/

/**
 * Ensure the lane has a live pane to dispatch into.
 *
 * Fast path: the stored pane is alive → reuse it.
 * Recreate path: pane gone, workspace alive → new tab in the stored workspace.
 * Heal path: the workspace is gone too → `herdr worktree open` reattaches the
 * existing worktree to a fresh workspace, then we create the tab there.
 *
 * Throws for any non-`workspace_not_found` failure — callers must not swallow
 * unrelated herdr errors (label invalid, worktree missing, etc.).
 */
export function ensureLanePane(lane: PaneHealLane, mainRepoCwd: string, deps: PaneHealDeps): EnsurePaneResult {
  const paneId = lane.paneId ?? ''
  if (paneId && deps.paneExists(paneId)) {
    return {healed: false, paneId}
  }

  const label = `hordr:${lane.epicBeanId}`
  const workspaceId = lane.workspaceId ?? ''
  try {
    const pane = deps.createTab({cwd: lane.worktreePath, label, workspaceId})
    return {healed: false, paneId: pane.pane_id}
  } catch (error) {
    if (!WORKSPACE_NOT_FOUND.test((error as Error).message)) throw error
    // Workspace died — reattach the working copy to a fresh workspace.
    const ws = deps.reattach(lane, mainRepoCwd)
    const pane = deps.createTab({cwd: lane.worktreePath, label, workspaceId: ws.workspaceId})
    return {healed: true, paneId: pane.pane_id, workspaceId: ws.workspaceId}
  }
}
