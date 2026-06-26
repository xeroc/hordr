import {Command} from '@oclif/core'

import {readWorktreeEvent} from '../events/payload.js'
import {listRuns, putRun} from '../state/run-store.js'

/**
 * Event hook: fired by herdr on `worktree.removed`.
 *
 * Marks any Run whose worktree.workspace_id matches the removed workspace as
 * `worktree.removed = true`. Does NOT delete the Run — it may be in `pr-open`
 * waiting for a GitHub merge (close-merged can still find the PR by branch).
 *
 * Branch is preserved so close-merged and other handlers can still derive
 * the PR ref; only herdr calls against the workspace are expected to fail.
 *
 * Idempotent: re-firing for an already-removed worktree is a no-op.
 */
export default class OnWorktreeRemoved extends Command {
  static description = 'Event hook: fired by herdr on worktree.removed.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await this.parse(OnWorktreeRemoved)

    const evt = readWorktreeEvent()
    if (!evt.workspaceId) {
      // Fall back to deriving from the worktree path if workspace_id missing.
      // (Shouldn't happen in practice — herdr always includes open_workspace_id.)
      this.log('on-worktree-removed: no workspace_id in payload, skipping')
      return
    }

    const target = evt.workspaceId
    const affected: string[] = []

    for (const run of listRuns()) {
      if (run.worktree?.workspace_id !== target) continue
      if (run.worktree.removed) continue // already tombstoned; idempotent skip

      putRun({
        ...run,
        worktree: {
          ...run.worktree,
          removed: true,
        },
      })
      affected.push(run.bean)
    }

    if (affected.length === 0) {
      this.log(`on-worktree-removed: no runs tracked workspace ${target}`)
    } else {
      this.log(`on-worktree-removed: marked ${affected.length} run(s) as worktree-removed: ${affected.join(', ')}`)
    }
  }
}
