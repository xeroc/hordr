import {Args, Command, Flags} from '@oclif/core'

import {listDrafts} from '../../dispatch/dispatch.js'
import {describeFleet} from '../../fleet/lifecycle.js'
import {openFleetDb} from '../../storage/db.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet status <milestone-id>
 *
 * The human's observation surface: fleet state + every lane (one per epic)
 * with its status, current task, pane, and branch. JSON mode for machines.
 */
export default class FleetStatus extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Show fleet state and per-lane status.'
  static examples = ['<%= config.bin %> fleet status hordr-ab12']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetStatus)
    const milestoneId = args.milestone
    const projectKey = resolveProjectKeyOrMock()

    const db = openFleetDb()
    try {
      const {fleet, lanes} = describeFleet(db, projectKey, milestoneId)
      const drafts = listDrafts(milestoneId)

      if (flags.json) {
        this.log(
          JSON.stringify({
            branch: fleet.branch,
            drafts,
            lanes: lanes.map((l) => ({
              branch: l.branch,
              currentTask: l.currentTaskBeanId,
              epic: l.epicBeanId,
              pane: l.paneId,
              status: l.status,
              worktree: l.worktreePath,
            })),
            milestone: milestoneId,
            projectKey,
            status: fleet.status,
          }),
        )
        return
      }

      this.log(`fleet ${milestoneId} — ${fleet.status} (branch ${fleet.branch})`)
      if (lanes.length === 0) {
        this.log('  no lanes yet (daemon creates them as epics unblock)')
      } else {
        for (const lane of lanes) {
          const task = lane.currentTaskBeanId ? ` → ${lane.currentTaskBeanId}` : ''
          const pane = lane.paneId ? ` [${lane.paneId}]` : ''
          this.log(`  ${lane.epicBeanId}: ${lane.status}${task}${pane}`)
        }
      }

      if (drafts.length > 0) {
        this.log('drafts awaiting review (approve with: beans update <id> -s todo):')
        for (const d of drafts) {
          this.log(`  ${d.id}: ${d.title}`)
        }
      }
    } finally {
      db.close()
    }
  }
}
