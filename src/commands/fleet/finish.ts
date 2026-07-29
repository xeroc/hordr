import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../../beans/client.js'
import {resolveBeansDir} from '../../beans/dir.js'
import {loadConfig} from '../../config/loader.js'
import {fetchChildStatuses} from '../../dispatch/dispatch.js'
import {getConflictedFiles, spawnMerger} from '../../dispatch/merger.js'
import {finishFleet} from '../../fleet/lifecycle.js'
import {removeWorktreeByPath} from '../../herdr/worktree.js'
import {getGitRunner} from '../../runtime.js'
import {openFleetDb} from '../../storage/db.js'
import {getFleetByMilestone} from '../../storage/fleets.js'

/**
 * hordr fleet finish <milestone-id>
 *
 * Assert the milestone + all epics are completed, merge the milestone branch
 * into primary (--no-ff), then drop the lane + fleet rows. Refuses if
 * incomplete. Reads bean status from the fleet's ms worktree — NOT the main
 * repo (which is on develop and has stale status). Cwd-independent: the fleet
 * is found by milestone id, and its stored projectRoot is used for git ops
 * against the main repo (hordr-i6ed).
 */
export default class FleetFinish extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Merge a completed fleet into primary and tear it down.'
  static examples = ['<%= config.bin %> fleet finish hordr-ab12']
  static flags = {
    base: Flags.string({description: 'Primary branch to merge into (defaults to config.primary_branch)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetFinish)
    const milestoneId = args.milestone

    const config = loadConfig()
    const primary = flags.base ?? config.primary_branch

    const db = openFleetDb()
    try {
      // Look up fleet by milestone id — works from any cwd (hordr-i6ed).
      const fleet = getFleetByMilestone(db, milestoneId)
      if (!fleet) {
        this.error(`no fleet for ${milestoneId}`)
      }

      const msCwd = fleet.worktreePath

      const result = finishFleet(
        db,
        milestoneId,
        {
          cwd: msCwd,
          mainRepoCwd: fleet.projectRoot || process.cwd(),
          primaryBranch: primary,
          projectKey: fleet.projectKey,
        },
        {
          beansDir: resolveBeansDir,
          beanStatus: (id) => getBean(id, {cwd: msCwd}).status as string | undefined,
          fetchEpicStatuses: (id) => fetchChildStatuses(id, {cwd: msCwd}),
          getConflictedFiles,
          git: getGitRunner(),
          removeWorktree: (worktreePath, opts) => removeWorktreeByPath(worktreePath, opts),
          spawnMerger: (opts) =>
            spawnMerger({
              config,
              ctx: {conflictedFiles: opts.conflictedFiles, sourceBranch: fleet.branch, targetBranch: primary},
              cwd: opts.cwd,
              mainRepoCwd: opts.mainRepoCwd,
            }),
        },
      )

      if (flags.json) {
        this.log(JSON.stringify({branch: result.branch, merged: result.merged, milestone: milestoneId, primary}))
      } else if (result.merged) {
        this.log(`finished fleet ${milestoneId}: merged ${result.branch} into ${primary}`)
      } else {
        this.log(
          `fleet ${milestoneId}: merge conflicted — spawned merger agent (pane=${result.conflictPaneId}). ` +
            `Run 'hordr fleet check' to complete.`,
        )
      }
    } finally {
      db.close()
    }
  }
}
