import {Args, Command, Flags} from '@oclif/core'

import {loadConfig} from '../config/loader.js'
import {getDeps} from '../runtime.js'
import {assertVcsReady} from '../vcs/resolve.js'

/**
 * Ad-hoc agent session: create an isolated working copy named after `name`
 * (git worktree branch / jj workspace), open a pane in it, and start the
 * default harness bare — no prompt, no persona, no flags. The human drives.
 * Bean-less counterpart to `hordr run`.
 */
export default class Prompt extends Command {
  static args = {name: Args.string({description: 'Name for the worktree/workspace (git branch or jj workspace name)', required: true})}
  static description = 'Create a worktree/workspace and open the default harness in a new pane.'
  static examples = [
    '<%= config.bin %> <%= command.id %> spike-auth',
    '<%= config.bin %> <%= command.id %> spike-auth --base main',
  ]
  static flags = {
    base: Flags.string({description: 'Base ref/branch for the worktree (defaults to config.primary_branch)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Prompt)
    const name = args.name!

    assertVcsReady(loadConfig(), process.cwd())

    const deps = getDeps()
    const wt = deps.createWorktree(name, flags.base ? {base: flags.base} : undefined)
    const pane = deps.launchHarness({cwd: wt.path ?? wt.workspaceId, name, workspaceId: wt.workspaceId})

    if (flags.json) {
      this.log(JSON.stringify({branch: wt.branch, name, pane: pane.paneLabel, workspace: wt.workspaceId}))
    } else {
      this.log(`started ${name} in ${wt.branch} (pane: ${pane.paneLabel})`)
    }
  }
}
