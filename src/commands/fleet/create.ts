import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../../beans/client.js'
import {loadConfig} from '../../config/loader.js'
import {createFleetEngine} from '../../dispatch/engine.js'
import {createFleet} from '../../fleet/lifecycle.js'
import {logger} from '../../logger.js'
import {openFleetDb} from '../../storage/db.js'
import {acquireFleetLock} from '../../storage/lock.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'
import {assertVcsReady, getVcsOrMock} from '../../vcs/resolve.js'
import {runFleetCheck} from './check.js'

/**
 * hordr fleet create <milestone-id>
 *
 * Bootstrap a fleet for a milestone bean: validate it's a milestone, create the
 * ms/<id> integration branch from primary, register the fleet row, then run one
 * `fleet check` pass so lanes spawn immediately. Per-epic lanes are otherwise
 * created lazily by `hordr fleet check` (ADR-0014/0015). Refuses if a fleet is
 * already active for the milestone.
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
    assertVcsReady(config, process.cwd())
    const primary = flags.base ?? config.primary_branch
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})
    const vcs = getVcsOrMock(config)

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
          createWorkspace(opts) {
            const ws = vcs.createWorkspace(opts)
            return {path: ws.path, workspaceId: ws.workspaceId}
          },
          fetchBean: (id) => getBean(id),
        },
      )

      // Kick the fleet off: one check pass creates initial lanes + spawns them.
      const check = runFleetCheck(db, {
        acquireLock: () => acquireFleetLock(),
        scan: (d) => createFleetEngine(config).scanFleet(d),
      })
      if (check.ran) {
        logger.info(
          `fleet check: ${check.result?.advanced ?? 0} lane(s) advanced, ${check.result?.lanesCreated ?? 0} lane(s) created`,
        )
      }

      if (flags.json) {
        this.log(
          JSON.stringify({
            branch: result.branch,
            milestone: milestoneId,
            projectKey,
          }),
        )
      } else {
        this.log(`fleet ${milestoneId} created on ${result.branch}`)
      }
    } finally {
      db.close()
    }
  }
}
