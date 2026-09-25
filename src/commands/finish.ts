import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {assertVcsReady, getVcsOrMock, resolveBaseRef} from '../vcs/resolve.js'

/**
 * Finish a bean: assert it is `completed`, merge its working copy's head into
 * the primary branch, then remove the working copy and safe-delete the ref.
 * Run from the main repo.
 *
 * The bean's status is read from the working copy (where the agent marked it
 * `completed`), not the main repo — the main copy is stale until the merge
 * brings the updated `.beans/` forward.
 *
 * git: 3-tier merge in the main repo (primary is checked out there), then
 * worktree removal + safe `branch -d`. jj: the merge runs IN the bean's
 * workspace (`jj new <primary> <bean>@` + bookmark move), then the workspace
 * is forgotten; no per-bean ref exists to delete.
 */
export default class Finish extends Command {
  static args = {bean: Args.string({description: 'Bean id to finish', required: true})}
  static description = 'Merge a completed bean into primary, remove its workspace, and delete the ref (-d).'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    base: Flags.string({description: 'Branch/bookmark to merge into (defaults to the current ref of the invocation directory)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Finish)
    const config = loadConfig()
    assertVcsReady(config, process.cwd())
    const vcs = getVcsOrMock(config)
    const beanId = args.bean
    const branch = beanId
    const cwd = process.cwd()
    const target = flags.base ?? resolveBaseRef(vcs, cwd)

    // 1. Locate the bean's working copy (tolerate "already gone": a re-run
    //    after a successful finish has nothing left — fall back to main-repo
    //    beans, the merge already carried the status forward).
    const ws = vcs.findWorkspace({cwd, name: branch})

    // 2. Confirm completed (from the working copy if present, else main repo).
    const bean = getBean(beanId, {cwd: ws?.path})
    if (bean.status !== 'completed') {
      this.error(`${beanId} is not completed (status: ${String(bean.status)})`)
    }

    if (vcs.kind === 'jj' && !ws) {
      this.error(
        `no jj workspace named '${branch}' found — the lane work must be merged manually ` +
          `(jj new ${target} and resolve, or recreate the workspace)`,
      )
    }

    // 3. Merge the bean's head into primary. git runs in the main repo;
    //    jj runs in the bean's workspace (bookmark move is repo-global).
    const mergeCwd = vcs.kind === 'jj' ? ws!.path! : cwd
    const outcome = vcs.mergeHeadIntoRef({
      cwd: mergeCwd,
      message: `merge: ${beanId} → ${target}`,
      ref: target,
      source: branch,
    })
    if (outcome.status === 'conflict') {
      this.error(`merge of ${branch} into ${target} conflicted — resolve manually in ${mergeCwd}`)
    }

    if (outcome.status === 'aborted') {
      this.error(`merge of ${branch} into ${target} aborted: ${outcome.message}`)
    }

    // 4. Remove the working copy (only if one was found).
    let removed = false
    let workspaceId: string | undefined
    if (ws) {
      vcs.removeWorkspace({cwd, name: branch, path: ws.path, workspaceId: ws.workspaceId})
      workspaceId = ws.workspaceId
      removed = true
    }

    // 5. Delete the merged ref (git only — jj lanes carry no per-bean ref).
    //    -d refuses unmerged branches — a natural safety net. Tolerant: a
    //    failure (e.g. orphaned ref) is logged, not fatal — the merge already
    //    landed. Mirrors finishLaneTeardown / finishFleetTeardown.
    let refDeleted = false
    if (vcs.kind === 'git') {
      try {
        vcs.deleteRef({cwd, name: branch})
        refDeleted = true
      } catch (error) {
        this.warn(
          `branch '${branch}' not deleted: ${(error as Error).message}. ` +
            `Merge landed in ${target}; orphaned ref needs manual cleanup.`,
        )
      }
    }

    if (flags.json) {
      this.log(
        JSON.stringify({
          bean: beanId,
          branch,
          branchDeleted: refDeleted,
          merged: true,
          removed,
          workspace: workspaceId,
        }),
      )
      return
    }

    if (!removed) {
      this.log(`no workspace for ${beanId} (branch ${branch})`)
    }

    this.log(
      `finished ${beanId}: merged ${branch} into ${target}` +
        (workspaceId ? `, removed workspace ${workspaceId}` : '') +
        (refDeleted ? `, deleted branch ${branch}` : ''),
    )
  }
}
