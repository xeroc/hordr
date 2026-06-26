/* eslint-disable camelcase -- run.worktree fields mirror the on-disk JSON contract (workspace_id) */
import {Command} from '@oclif/core'

import {loadConfig} from '../config/loader.js'
import {beanIdFromBranch, readWorktreeEvent} from '../events/payload.js'
import {getRun, putRun} from '../state/run-store.js'

/**
 * Event hook: fired by herdr on `worktree.created`.
 *
 * Reads HERDR_PLUGIN_EVENT_JSON. If the branch matches the configured
 * `worktree_branch_prefix` (e.g. `bean/hordr-1234`), updates the matching
 * Run's worktree field with the new workspace_id + path. Non-hordr branches
 * are no-ops. Idempotent: re-firing the same event for the same workspace is
 * safe.
 *
 * This command is normally invoked by herdr with HERDR_PLUGIN_STATE_DIR set
 * to the plugin's private state dir (e.g.
 * `~/.local/state/herdr/plugins/herdr.hordr`). That's where Run state files
 * live — see src/state/run-store.ts.
 */
export default class OnWorktreeCreated extends Command {
  static description = 'Event hook: fired by herdr on worktree.created.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await this.parse(OnWorktreeCreated)

    const evt = readWorktreeEvent()
    if (!evt.branch) {
      // No branch in payload — nothing for hordr to track.
      this.log('on-worktree-created: no branch in payload, skipping')
      return
    }

    const config = loadConfig()
    const beanId = beanIdFromBranch(evt.branch, config.worktree_branch_prefix)
    if (!beanId) {
      // Not a hordr-managed worktree (e.g. user manually ran `git worktree add`).
      this.log(`on-worktree-created: branch '${evt.branch}' is not a hordr branch, skipping`)
      return
    }

    if (!evt.workspaceId) {
      this.log(`on-worktree-created: no workspace_id in payload for ${beanId}, skipping`)
      return
    }

    const run = getRun(beanId)
    if (!run) {
      // Worktree created but no Run exists yet (e.g. user branched manually
      // before `hordr plan`). Nothing to update.
      this.log(`on-worktree-created: no run for ${beanId}, skipping`)
      return
    }

    // Idempotency: if the Run already references this workspace, no-op.
    if (run.worktree?.workspace_id === evt.workspaceId && !run.worktree?.removed) {
      this.log(`on-worktree-created: run for ${beanId} already at workspace ${evt.workspaceId}`)
      return
    }

    const updated = {
      ...run,
      worktree: {
        branch: evt.branch,
        path: evt.path ?? run.worktree?.path,
        workspace_id: evt.workspaceId,
      },
    }
    putRun(updated)
    this.log(`on-worktree-created: ${beanId} → workspace ${evt.workspaceId}`)
  }
}
