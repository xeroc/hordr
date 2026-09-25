import {Args, Command, Flags} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {getDeps} from '../runtime.js'
import {assertVcsReady} from '../vcs/resolve.js'

/**
 * Fire-and-forget bean launch: create a worktree, spawn the harness in a
 * fresh pane with persona + bean body as the prompt. Returns immediately.
 * Default role is `implementer`; override with --role.
 */
export default class Run extends Command {
  static args = {bean: Args.string({description: 'Bean id to run', required: true})}
  static description = 'Create a worktree and spawn the agent harness for a bean.'
  static examples = [
    '<%= config.bin %> <%= command.id %> hordr-1234',
    '<%= config.bin %> <%= command.id %> hordr-1234 --role reviewer',
  ]
  static flags = {
    base: Flags.string({description: 'Base branch/bookmark for the worktree (defaults to the current ref of the invocation directory)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
    role: Flags.string({default: 'implementer', description: 'Agent role to spawn (from config.agents)'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Run)
    const beanId = args.bean

    assertVcsReady(loadConfig(), process.cwd())
    getBean(beanId)

    const deps = getDeps()
    const wt = deps.createWorktree(beanId, flags.base ? {base: flags.base} : undefined)
    const pane = deps.launchAgent({
      beanId,
      cwd: wt.path ?? wt.workspaceId,
      role: flags.role!,
      workspaceId: wt.workspaceId,
    })

    if (flags.json) {
      this.log(
        JSON.stringify({
          bean: beanId,
          branch: wt.branch,
          pane: pane.paneLabel,
          role: flags.role,
          workspace: wt.workspaceId,
        }),
      )
    } else {
      this.log(`started ${beanId} in ${wt.branch} (role: ${flags.role}, pane: ${pane.paneLabel})`)
    }
  }
}
