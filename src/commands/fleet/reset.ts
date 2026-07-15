import {Args, Command, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'

import {resetLane} from '../../fleet/lifecycle.js'
import {createTab, paneExists} from '../../herdr/pane.js'
import {createWorktree, openWorktree} from '../../herdr/worktree.js'
import {openFleetDb} from '../../storage/db.js'
import {getFleet, listLanes} from '../../storage/fleets.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet reset <milestone-id> [--lane <epic-id>] [--force]
 *
 * Reset a lane (or all conflict/uncommitted lanes) back to active. Ensures
 * the worktree and pane exist — recreates either if gone. Clears the current
 * task so the daemon's next tick dispatches fresh. The daemon picks up the
 * active lane on its next tick.
 */
export default class FleetReset extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id', required: true})}
  static description = 'Reset a lane or fleet — recreates worktree + pane if gone.'
  static examples = [
    '<%= config.bin %> fleet reset hordr-ab12',
    '<%= config.bin %> fleet reset hordr-ab12 --lane hordr-epic1',
    '<%= config.bin %> fleet reset hordr-ab12 --force',
  ]
  static flags = {
    force: Flags.boolean({
      default: false,
      description: 'Also reset uncommitted lanes (potential data loss if worktree is recreated)',
    }),
    json: Flags.boolean({default: false}),
    lane: Flags.string({description: 'Reset only this lane (epic id). Default: all stuck lanes.'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetReset)
    const milestoneId = args.milestone
    const cwd = process.cwd()
    const projectKey = resolveProjectKeyOrMock({cwd})

    const db = openFleetDb()
    try {
      const fleet = getFleet(db, projectKey, milestoneId)
      if (!fleet) {
        this.error(`no fleet for ${milestoneId}`)
      }

      const lanes = listLanes(db, projectKey, milestoneId)
      const stuckStatuses = flags.force ? ['conflict', 'uncommitted'] : ['conflict']
      const toReset = flags.lane
        ? lanes.filter((l) => l.epicBeanId === flags.lane)
        : lanes.filter((l) => stuckStatuses.includes(l.status))

      if (toReset.length === 0) {
        const target = flags.lane ? `lane ${flags.lane}` : `${stuckStatuses.join('/')} lanes`
        this.log(`no ${target} found for ${milestoneId}`)
        return
      }

      const results: Array<{lane: string; paneCreated: boolean; worktreeCreated: boolean}> = []

      for (const lane of toReset) {
        const res = resetLane(db, lane, fleet, {
          createPane(opts) {
            const pane = createTab({cwd: opts.cwd, label: opts.label, workspaceId: opts.workspaceId})
            return pane.pane_id
          },
          createWorktree(opts) {
            const wt = createWorktree({base: opts.base, branch: opts.branch, cwd: opts.cwd})
            return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
          },
          openWorktree(opts) {
            const wt = openWorktree({branch: opts.branch, cwd: opts.cwd})
            return {path: wt.path ?? wt.workspace_id, workspaceId: wt.workspace_id}
          },
          paneExists,
          worktreeExists: (path) => existsSync(path),
        })

        const parts = [`${lane.epicBeanId}: ${lane.status} → active`]
        if (res.worktreeCreated) parts.push('worktree recreated')
        if (res.paneCreated) parts.push('pane created')
        this.log(parts.join(', '))
        results.push({lane: lane.epicBeanId, ...res})
      }

      if (flags.json) {
        this.log(JSON.stringify({milestone: milestoneId, reset: results}))
      } else {
        this.log(`reset ${toReset.length} lane(s). Daemon will pick up on next tick.`)
      }
    } finally {
      db.close()
    }
  }
}
