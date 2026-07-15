import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../../beans/client.js'
import {loadConfig} from '../../config/loader.js'
import {fetchChildStatuses} from '../../dispatch/dispatch.js'
import {finishFleet} from '../../fleet/lifecycle.js'
import {removeWorktreeByBranch} from '../../herdr/worktree.js'
import {getGitRunner} from '../../runtime.js'
import {openFleetDb} from '../../storage/db.js'
import {getFleet} from '../../storage/fleets.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet finish <milestone-id>
 *
 * Assert the milestone + all epics are completed, merge the milestone branch
 * into primary (--no-ff), then drop the lane + fleet rows. Refuses if
 * incomplete. Reads bean status from the fleet's ms worktree — NOT the main
 * repo (which is on develop and has stale status).
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
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})

    const db = openFleetDb()
    try {
      // Read bean status from the fleet's ms worktree, not process.cwd().
      // The ms worktree is on the milestone branch where completed epics are visible.
      const fleet = getFleet(db, projectKey, milestoneId)
      if (!fleet) {
        this.error(`no fleet for ${milestoneId}`)
      }

      const msCwd = fleet.worktreePath

      const result = finishFleet(
        db,
        milestoneId,
        {cwd: msCwd, primaryBranch: primary, projectKey},
        {
          beanStatus: (id) => getBean(id, {cwd: msCwd}).status as string | undefined,
          fetchEpicStatuses: (id) => fetchChildStatuses(id, {cwd: msCwd}),
          git: getGitRunner(),
          removeWorktree: (branch) => removeWorktreeByBranch(branch, cwd),
        },
      )

      if (flags.json) {
        this.log(JSON.stringify({branch: result.branch, merged: result.merged, milestone: milestoneId, primary}))
      } else {
        this.log(`finished fleet ${milestoneId}: merged ${result.branch} into ${primary}`)
      }
    } finally {
      db.close()
    }
  }
}
