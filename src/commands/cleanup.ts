import {Args, Command, Flags} from '@oclif/core'

import {branchFor, HerdrError, openWorktree, removeWorktree} from '../herdr/worktree.js'

/**
 * Tear down a bean's worktree: find the workspace via the bean's branch,
 * remove it. The branch itself is left for `git branch -d` by the human
 * (herdr's worktree remove may or may not delete it depending on config).
 *
 * No-op (with a message) if no worktree exists for the bean — safe to call
 * speculatively.
 */
export default class Cleanup extends Command {
  static args = {bean: Args.string({description: 'Bean id whose worktree to remove', required: true})}
  static description = 'Remove the worktree hordr created for a bean.'
  static examples = [
    '<%= config.bin %> <%= command.id %> hordr-1234',
    '<%= config.bin %> <%= command.id %> hordr-1234 --force',
  ]
  static flags = {
    force: Flags.boolean({default: false, description: 'Force-remove even if the worktree has unmerged changes'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Cleanup)
    const branch = branchFor(args.bean)
    const cwd = process.cwd()

    let workspaceId: string
    try {
      const wt = openWorktree({branch, cwd})
      workspaceId = wt.workspace_id
    } catch (error) {
      if (error instanceof HerdrError && /worktree_not_found/.test(error.message)) {
        if (flags.json) this.log(JSON.stringify({bean: args.bean, removed: false}))
        else this.log(`no worktree for ${args.bean} (branch ${branch})`)
        return
      }

      throw error
    }

    removeWorktree({force: flags.force, workspaceId})

    if (flags.json) {
      this.log(JSON.stringify({bean: args.bean, branch, removed: true, workspace: workspaceId}))
    } else {
      this.log(`removed worktree for ${args.bean} (branch ${branch}, workspace ${workspaceId})`)
    }
  }
}
