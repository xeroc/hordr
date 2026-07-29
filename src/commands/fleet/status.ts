import {Args, Command, Flags} from '@oclif/core'

import {listDrafts} from '../../dispatch/dispatch.js'
import {openFleetDb} from '../../storage/db.js'
import {type FleetRow, getFleetByMilestone, type LaneRow, listFleets, listLanes} from '../../storage/fleets.js'

/**
 * hordr fleet status [milestone-id]
 *
 * The human's observation surface: fleet state + every lane (one per epic)
 * with its status, current task, pane, and branch. JSON mode for machines.
 *
 * With a milestone id: shows that fleet (found by milestone id, any cwd).
 * With no milestone id: lists every fleet across ALL projects.
 */
export default class FleetStatus extends Command {
  static args = {milestone: Args.string({description: 'Milestone bean id; omit to list all fleets'})}
  static description = 'Show fleet state and per-lane status (all fleets across all projects when no milestone given).'
  static examples = ['<%= config.bin %> fleet status hordr-ab12', '<%= config.bin %> fleet status']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FleetStatus)

    const db = openFleetDb()
    try {
      if (args.milestone) {
        const fleet = getFleetByMilestone(db, args.milestone)
        if (!fleet) {
          this.error(`no fleet for ${args.milestone}`)
        }

        const lanes = listLanes(db, fleet.projectKey, fleet.milestoneBeanId)
        const drafts = this.safeDrafts(args.milestone, fleet.worktreePath)
        this.emitFleet(fleet, lanes, drafts, flags.json)
        return
      }

      const fleets = listFleets(db)
      if (fleets.length === 0) {
        if (flags.json) {
          this.log('[]')
        } else {
          this.log('no fleets')
        }

        return
      }

      if (flags.json) {
        const perFleet = fleets.map((f) => {
          const drafts = this.safeDrafts(f.milestoneBeanId, f.worktreePath)
          return this.fleetJson(f, listLanes(db, f.projectKey, f.milestoneBeanId), drafts)
        })
        this.log(JSON.stringify(perFleet))
        return
      }

      for (const f of fleets) {
        const lanes = listLanes(db, f.projectKey, f.milestoneBeanId)
        const drafts = this.safeDrafts(f.milestoneBeanId, f.worktreePath)
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

    this.log(`fleet ${fleet.milestoneBeanId} — ${fleet.status} (branch ${fleet.branch}) [${fleet.projectKey}]`)
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

  /**
   * List drafts, tolerating a missing worktree or binary. `execFileSync` with
   * a non-existent cwd throws ENOENT (misleadingly naming the binary, not the
   * cwd). When the worktree is gone (old fleet, torn down, different host)
   * there are no drafts to list — return [].
   */
  private safeDrafts(milestoneId: string, worktreePath: string): Array<{id: string; title: string}> {
    try {
      return listDrafts(milestoneId, {cwd: worktreePath})
    } catch {
      return []
    }
  }
}
