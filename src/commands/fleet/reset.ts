import {Args, Command, Flags} from '@oclif/core'

import {openFleetDb} from '../../storage/db.js'
import {getFleet, listLanes, updateLaneStatus} from '../../storage/fleets.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet reset <milestone-id> [--lane <epic-id>]
 *
 * Reset a lane (or all lanes) from 'conflict' back to 'active'. Use after
 * manually resolving a merge conflict or when a lane is stuck from a stale
 * crash detection. The daemon's next tick picks up the active lane.
 */
export default class FleetReset extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Reset a lane or fleet from conflict back to active.'
  static examples = [
    '<%= config.bin %> fleet reset hordr-ab12',
    '<%= config.bin %> fleet reset hordr-ab12 --lane hordr-epic1',
  ]
  static flags = {
    lane: Flags.string({description: 'Reset only this lane (epic id). Default: all conflict lanes.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetReset)
    const milestoneId = args.milestone
    const projectKey = resolveProjectKeyOrMock()

    const db = openFleetDb()
    try {
      const fleet = getFleet(db, projectKey, milestoneId)
      if (!fleet) {
        this.error(`no fleet for ${milestoneId}`)
      }

      const lanes = listLanes(db, projectKey, milestoneId)
      const toReset = flags.lane
        ? lanes.filter((l) => l.epicBeanId === flags.lane)
        : lanes.filter((l) => l.status === 'conflict')

      if (toReset.length === 0) {
        const target = flags.lane ? `lane ${flags.lane}` : 'conflict lanes'
        this.log(`no ${target} found for ${milestoneId}`)
        return
      }

      for (const lane of toReset) {
        updateLaneStatus(db, {epicId: lane.epicBeanId, milestoneId, projectKey}, 'active')
        this.log(`lane ${lane.epicBeanId}: conflict → active`)
      }

      this.log(`reset ${toReset.length} lane(s). Daemon will pick up on next tick.`)
    } finally {
      db.close()
    }
  }
}
