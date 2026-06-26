import {Args, Command} from '@oclif/core'

export default class Supervise extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to supervise', required: true}),
  }
  static description = 'Blocking loop: while run is not terminal, advance and wait. Runs in the supervisor pane.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Supervise)
    this.error(`not implemented: supervise ${args.bean}`, {exit: 2})
  }
}
