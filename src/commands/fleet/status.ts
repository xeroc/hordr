import {Args, Command, Flags} from '@oclif/core'

import {listDrafts} from '../../dispatch/dispatch.js'
import {describeFleet} from '../../fleet/lifecycle.js'
import {openFleetDb} from '../../storage/db.js'
import {type FleetRow, type LaneRow, listFleets, listLanes} from '../../storage/fleets.js'
import {resolveProjectKeyOrMock} from '../../storage/project.js'

/**
 * hordr fleet status [milestone-id]
 *
 * The human's observation surface: fleet state + every lane (one per epic)
 * with its status, current task, pane, and branch. JSON mode for machines.
 *
 * With no milestone id: lists every fleet for the current project.
 */
export default class FleetStatus extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id; omit to list all fleets'})}
  static description = 'Show fleet state and per-lane status (all fleets when no milestone given).'
  static examples = ['<%= config.bin %> fleet status hordr-ab12', '<%= config.bin %> fleet status']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetStatus)
    const projectKey = resolveProjectKeyOrMock()

    const db = openFleetDb()
    try {
      if (args.milestone) {
        const snapshot = describeFleet(db, projectKey, args.milestone)
        const drafts = listDrafts(args.milestone, {cwd: snapshot.fleet.worktreePath})
        this.emitFleet(snapshot.fleet, snapshot.lanes, drafts, flags.json)
        return
      }

      const fleets = listFleets(db, {projectKey})
      if (fleets.length === 0) {
        if (flags.json) {
          this.log('[]')
        } else {
          this.log(`no fleets for project ${projectKey}`)
        }

        return
      }

      if (flags.json) {
        const perFleet = fleets.map((f) => {
          const drafts = listDrafts(f.milestoneBeanId, {cwd: f.worktreePath})
          return this.fleetJson(f, listLanes(db, projectKey, f.milestoneBeanId), drafts)
        })
        this.log(JSON.stringify(perFleet))
        return
      }

      for (const f of fleets) {
        const lanes = listLanes(db, projectKey, f.milestoneBeanId)
        const drafts = listDrafts(f.milestoneBeanId, {cwd: f.worktreePath})
        this.emitFleet(f, lanes, drafts, false)
      }
    } finally {
      db.close()
    }
  }

  private emitFleet(
    fleet: FleetRow,
    lanes: LaneRow[],
    drafts: Array<{id: string; title: string}>,
    json: boolean,
  ): void {
    if (json) {
      this.log(JSON.stringify(this.fleetJson(fleet, lanes, drafts)))
      return
    }

    this.log(`fleet ${fleet.milestoneBeanId} — ${fleet.status} (branch ${fleet.branch})`)
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
  }

  private fleetJson(fleet: FleetRow, lanes: LaneRow[], drafts: Array<{id: string; title: string}>) {
    return {
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
      milestone: fleet.milestoneBeanId,
      projectKey: fleet.projectKey,
      status: fleet.status,
    }
  }
}
