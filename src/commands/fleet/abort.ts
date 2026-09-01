import {Args, Command, Flags} from '@oclif/core'

import {loadConfig} from '../../config/loader.js'
import {abortFleet} from '../../fleet/lifecycle.js'
import {logger} from '../../logger.js'
import {openFleetDb} from '../../storage/db.js'
import {getFleetByMilestone} from '../../storage/fleets.js'
import {getVcsOrMock} from '../../vcs/resolve.js'

/**
 * hordr fleet abort <milestone-id> [--force]
 *
 * Stop the fleet: delete all lane + fleet rows so the daemon's tick stops
 * dispatching. Worktrees are kept by default (work preserved). --force also
 * removes every lane worktree and deletes the ms/<id> branch. Beans are kept.
 * Cwd-independent: fleet found by milestone id, stored projectRoot is the git
 * cwd (hordr-i6ed).
 */
export default class FleetAbort extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Abort a fleet, keeping work by default (--force discards it).'
  static examples = ['<%= config.bin %> fleet abort hordr-ab12', '<%= config.bin %> fleet abort hordr-ab12 --force']
  static flags = {
    force: Flags.boolean({default: false, description: 'Also remove lane worktrees and the ms/<id> branch'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetAbort)
    const milestoneId = args.milestone
    const vcs = getVcsOrMock(loadConfig())
    const db = openFleetDb()
    try {
      const fleet = getFleetByMilestone(db, milestoneId)
      if (!fleet) {
        this.error(`no fleet for ${milestoneId}`)
      }

      const result = abortFleet(
        db,
        milestoneId,
        {cwd: fleet.projectRoot || process.cwd(), force: flags.force, projectKey: fleet.projectKey},
        {
          discardRef: (o) => vcs.deleteRef({...o, force: true}),
          // Discard is best-effort: a lane the daemon already cleaned up (or
          // one that refuses removal) must not fail the whole abort.
          removeWorkspace(o) {
            try {
              vcs.removeWorkspace(o)
            } catch (error) {
              logger.warn(`abort: worktree removal failed for ${o.name}: ${(error as Error).message}`)
            }
          },
        },
      )

      if (flags.json) {
        this.log(
          JSON.stringify({
            branch: result.branch,
            force: flags.force,
            milestone: milestoneId,
            worktreesRemoved: result.worktreesRemoved,
          }),
        )
      } else {
        const kept = flags.force ? '' : ' (worktrees kept; use --force to discard)'
        this.log(`aborted fleet ${milestoneId}; removed ${result.worktreesRemoved} worktree(s)${kept}`)
      }
    } finally {
      db.close()
    }
  }
}
