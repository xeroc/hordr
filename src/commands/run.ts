import {Args, Command} from '@oclif/core'

export default class Run extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to enqueue', required: true}),
  }
  static description = 'Enqueue bean; drain queue if a slot is available. Spawns the supervisor pane.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Run)
    this.error(`not implemented: run ${args.bean}`, {exit: 2})
  }
}
