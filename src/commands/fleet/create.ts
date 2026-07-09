import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../../beans/client.js'
import {loadConfig} from '../../config/loader.js'
import {ensureDaemon} from '../../daemon/ensure.js'
import {createFleet} from '../../fleet/lifecycle.js'
import {getGitRunner} from '../../runtime.js'
import {openFleetDb} from '../../storage/db.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet create <milestone-id>
 *
 * Bootstrap a fleet for a milestone bean: validate it's a milestone, create the
 * ms/<id> integration branch from primary, register the fleet row, and ensure
 * the daemon is running. Per-epic lanes are created lazily by the daemon tick
 * (ADR-0014). Refuses if a fleet is already active for the milestone.
 */
export default class FleetCreate extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Bootstrap a fleet for a milestone bean.'
  static examples = ['<%= config.bin %> fleet create hordr-ab12']
  static flags = {
    base: Flags.string({description: 'Base branch for ms/<id> (defaults to config.primary_branch)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetCreate)
    const milestoneId = args.milestone

    getBean(milestoneId)

    const config = loadConfig()
    const primary = flags.base ?? config.primary_branch
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})

    const db = openFleetDb()
    try {
      const result = await createFleet(
        db,
        milestoneId,
        {
          cwd,
          primaryBranch: primary,
          project: {
            beansPath: cwd,
            companyPath: config.company?.path ?? null,
            configPath: cwd,
            projectKey,
          },
        },
        {
          ensureDaemon,
          fetchBean: (id) => getBean(id),
          git: getGitRunner(),
        },
      )

      if (flags.json) {
        this.log(
          JSON.stringify({
            branch: result.branch,
            daemonStarted: result.daemonStarted,
            milestone: milestoneId,
            projectKey,
          }),
        )
      } else {
        this.log(
          `fleet ${milestoneId} created on ${result.branch} (daemon ${result.daemonStarted ? 'started' : 'already running'})`,
        )
      }
    } finally {
      db.close()
    }
  }
}
