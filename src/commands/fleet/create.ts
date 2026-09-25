import {Args, Command, Flags} from '@oclif/core'
import path from 'node:path'

import {type BeanRecord, getBean} from '../../beans/client.js'
import {loadConfig} from '../../config/loader.js'
import {createFleetEngine} from '../../dispatch/engine.js'
import {createFleet} from '../../fleet/lifecycle.js'
import {logger} from '../../logger.js'
import {openFleetDb} from '../../storage/db.js'
import {acquireFleetLock} from '../../storage/lock.js'
import {resolveMainCheckout, resolveProjectKeyOrMock} from '../../storage/project.js'
import {assertVcsReady, getVcsOrMock, resolveBaseRef} from '../../vcs/resolve.js'
import {runFleetCheck} from './check.js'

/**
 * Read the milestone bean, tolerating invocation from a workspace (git
 * worktree / jj workspace) whose working copy predates the bean: fall back
 * to the main checkout, which holds the authoritative .beans/.
 */
function fetchMilestoneBean(id: string, cwd: string, mainRoot: string): BeanRecord {
  try {
    return getBean(id, {cwd})
  } catch (error) {
    if (mainRoot === cwd) throw error
    return getBean(id, {cwd: mainRoot})
  }
}

/**
 * hordr fleet create <milestone-id>
 *
 * Bootstrap a fleet for a milestone bean: validate it's a milestone, create
 * the ms/<id> integration workspace based on the CURRENT ref (the branch /
 * bookmark of the invocation directory — no configured trunk), register the
 * fleet row with that base so `fleet finish` merges back into it, then run
 * one `fleet check` pass so lanes spawn immediately. Per-epic lanes are
 * otherwise created lazily by `hordr fleet check` (ADR-0014/0015). Refuses
 * if a fleet is already active for the milestone.
 *
 * Works from any working copy of the project: git/beans operations run
 * against the MAIN checkout (herdr rejects workspace creation from a linked
 * worktree; the main checkout holds the authoritative .beans/).
 */
export default class FleetCreate extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Bootstrap a fleet for a milestone bean.'
  static examples = ['<%= config.bin %> fleet create hordr-ab12']
  static flags = {
    base: Flags.string({description: 'Base branch/bookmark for the fleet (defaults to the current ref of the invocation directory)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetCreate)
    const milestoneId = args.milestone

    const config = loadConfig()
    assertVcsReady(config, process.cwd())
    const vcs = getVcsOrMock(config)
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})
    const mainRoot = path.resolve(resolveMainCheckout({cwd}))
    const baseRef = flags.base ?? resolveBaseRef(vcs, cwd)

    fetchMilestoneBean(milestoneId, cwd, mainRoot)

    const db = openFleetDb()
    try {
      const result = await createFleet(
        db,
        milestoneId,
        {
          baseRef,
          cwd: mainRoot,
          project: {
            beansPath: mainRoot,
            companyPath: config.company?.path ?? null,
            configPath: mainRoot,
            projectKey,
          },
        },
        {
          createWorkspace(opts) {
            const ws = vcs.createWorkspace(opts)
            return {path: ws.path, workspaceId: ws.workspaceId}
          },
          fetchBean: (id) => fetchMilestoneBean(id, cwd, mainRoot),
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
