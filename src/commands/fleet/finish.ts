import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../../beans/client.js'
import {fetchChildStatuses} from '../../dispatch/dispatch.js'
import {finishFleet} from '../../fleet/lifecycle.js'
import {getGitRunner} from '../../runtime.js'
import {openFleetDb} from '../../storage/db.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet finish <milestone-id>
 *
 * Assert the milestone + all epics are completed, merge ms/<id> into primary
 * (--no-ff), then drop the lane + fleet rows. Refuses if incomplete. Worktrees
 * are torn down by the daemon at epic-merge time; finish only cleans the rows.
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

    const primary = flags.base ?? 'develop'
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})

    const db = openFleetDb()
    try {
      const result = finishFleet(
        db,
        milestoneId,
        {cwd, primaryBranch: primary, projectKey},
        {
          beanStatus: (id) => getBean(id, {cwd}).status as string | undefined,
          fetchEpicStatuses: (id) => fetchChildStatuses(id, {cwd}),
          git: getGitRunner(),
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
