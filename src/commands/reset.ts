import {Args, Command, Flags} from '@oclif/core'

export default class Reset extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to reset', required: true}),
  }
  static description = 'Delete run state, worktree, and branch. Bean reverts to todo.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    force: Flags.boolean({char: 'f', description: 'Skip confirmation prompt'}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Reset)
    this.error(`not implemented: reset ${args.bean}`, {exit: 2})
  }
}
