/**
 * Pane reuse per lane (ADR-0009).
 *
 * On first dispatch for a lane, a pane/tab is created in the lane's worktree
 * and its id is stored on the lane row. Every subsequent invocation reuses
 * that pane — `herdr pane run` sends a fresh harness command into it after the
 * prior process exits. Between tasks the pane sits briefly at a shell prompt.
 *
 * Shell-state leakage is bounded: each invocation is a fresh harness process
 * (`<harness> run --interactive <prompt>`), so no env/cwd carries across —
 * the only shared state is the pane itself, which the next command resets.
 */
export interface EnsurePaneDeps {
  /** Create a pane/tab in the worktree; return its pane id. */
  createPane: (opts: {cwd: string; label: string; workspaceId: string}) => string
}

export interface EnsurePaneOpts {
  epicId: string
  /** The lane's existing pane id, if one was created on a prior dispatch. */
  existingPaneId?: null | string
  workspaceId: string
  worktreePath: string
}

export interface EnsurePaneResult {
  /** True if this call created the pane; false if it reused an existing one. */
  created: boolean
  paneId: string
}

/**
 * Return the lane's pane id, creating it on first use. Pure: the daemon wires
 * the real herdr `tab create` via deps.createPane and persists the result with
 * setLanePane.
 */
export function ensureLanePane(opts: EnsurePaneOpts, deps: EnsurePaneDeps): EnsurePaneResult {
  if (opts.existingPaneId) {
    return {created: false, paneId: opts.existingPaneId}
  }

  const paneId = deps.createPane({
    cwd: opts.worktreePath,
    label: `hordr:${opts.epicId}`,
    workspaceId: opts.workspaceId,
  })
  return {created: true, paneId}
}
