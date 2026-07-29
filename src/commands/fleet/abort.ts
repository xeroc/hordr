import {Args, Command, Flags} from '@oclif/core'

import {abortFleet} from '../../fleet/lifecycle.js'
import {HerdrError, openWorktree, removeWorktree} from '../../herdr/worktree.js'
import {getGitRunner} from '../../runtime.js'
import {openFleetDb} from '../../storage/db.js'
import {getFleetByMilestone} from '../../storage/fleets.js'

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
          git: getGitRunner(),
          removeWorktree: (branch) => removeWorktreeByBranch(branch, fleet.projectRoot || process.cwd()),
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

/**
 * Remove a lane worktree by its branch: open (to resolve the workspace) then
 * remove. Tolerant of an already-gone worktree (lane was 'done' / merged).
 */
function removeWorktreeByBranch(branch: string, cwd: string): void {
  // ponytail: tolerate missing worktree — abort must not fail on a lane the
  // daemon already cleaned up.
  let workspaceId: string | undefined
  try {
    const result = openWorktree({branch, cwd})
    workspaceId = result.workspace_id
  } catch (error) {
    if (!(error instanceof HerdrError) || !/worktree_not_found/.test(error.message)) throw error
    return // already gone
  }

  if (workspaceId) removeWorktree({force: true, workspaceId})
}
