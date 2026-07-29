import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {branchFor, HerdrError, openWorktree, removeWorktree, type WorktreeInfo} from '../herdr/worktree.js'
import {gitDeleteBranch, gitMergeBranch} from '../runtime.js'

/**
 * Finish a bean: assert it is `completed`, merge its worktree branch into the
 * primary branch, then remove the worktree and safe-delete the branch (`-d`,
 * never `-D`). Run from the main repo.
 *
 * The bean's status is read from the worktree (where the agent marked it
 * `completed`), not the main repo — the main copy is stale until the merge
 * brings the updated `.beans/` forward.
 *
 * Order matters: merge first (the branch is what we care about), remove the
 * worktree, then delete the now-merged branch. If the worktree is already
 * gone, the merge still ran — we log and finish. Branch deletion is tolerant:
 * a failure (orphaned ref) is warned, not fatal — the merge already landed.
 */
export default class Finish extends Command {
  static args = {bean: Args.string({description: 'Bean id to finish', required: true})}
  static description = 'Merge a completed bean branch into primary, remove its worktree, and delete the branch (-d).'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Finish)
    const config = loadConfig()
    const beanId = args.bean
    const branch = branchFor(beanId)
    const cwd = process.cwd()

    // 1. Open the worktree up front: we need its path to read the bean from
    //    the branch it was worked on, and its workspace_id to remove it later.
    //    Tolerate "already gone": a re-run after a successful finish has no
    //    worktree — fall back to main-repo beans (the merge already carried
    //    the status forward).
    let wt: undefined | WorktreeInfo
    try {
      wt = openWorktree({branch, cwd})
    } catch (error) {
      if (!(error instanceof HerdrError) || !/worktree_not_found/.test(error.message)) throw error
      // worktree already gone — fall through, read bean from main repo.
    }

    // 2. Confirm completed (from the worktree if present, else main repo).
    const bean = getBean(beanId, {cwd: wt?.path})
    if (bean.status !== 'completed') {
      this.error(`${beanId} is not completed (status: ${String(bean.status)})`)
    }

    // 3. Merge <id> into primary.
    gitMergeBranch(config.primary_branch, branch, cwd)

    // 4. Remove the worktree (only if we opened it).
    let workspaceId: string | undefined
    let removed = false
    if (wt) {
      workspaceId = wt.workspace_id
      removeWorktree({workspaceId})
      removed = true
    }

    // 5. Delete the merged branch: -d (safe, NEVER -D). The worktree is gone
    //    (or never existed), so git won't refuse on a checked-out branch, and
    //    -d refuses unmerged branches — a natural safety net. Tolerant: a
    //    failure (e.g. orphaned ref) is logged, not fatal — the merge already
    //    landed. Mirrors finishLaneTeardown / finishFleetTeardown.
    let branchDeleted = false
    try {
      gitDeleteBranch(branch, cwd)
      branchDeleted = true
    } catch (error) {
      this.warn(
        `branch '${branch}' not deleted: ${(error as Error).message}. ` +
          `Merge landed in ${config.primary_branch}; orphaned ref needs manual cleanup.`,
      )
    }

    if (flags.json) {
      this.log(
        JSON.stringify({
          bean: beanId,
          branch,
          branchDeleted,
          merged: true,
          removed,
          workspace: workspaceId,
        }),
      )
      return
    }

    if (!removed) {
      this.log(`no worktree for ${beanId} (branch ${branch})`)
    }

    this.log(
      `finished ${beanId}: merged ${branch} into ${config.primary_branch}` +
        (workspaceId ? `, removed worktree ${workspaceId}` : '') +
        (branchDeleted ? `, deleted branch ${branch}` : ''),
    )
  }
}
