import {Args, Command} from '@oclif/core'

export default class Take extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to take over', required: true}),
  }
  static description = 'Focus the blocked pane for interactive recovery. Run stays blocked until advance.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Take)
    this.error(`not implemented: take ${args.bean}`, {exit: 2})
  }
}
