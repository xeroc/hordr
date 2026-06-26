import {Args, Command} from '@oclif/core'

export default class Plan extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to plan', required: true}),
  }
  static description = 'Create a Run, spawn planner pane, draft spec. Bean transitions to draft.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Plan)
    this.error(`not implemented: plan ${args.bean}`, {exit: 2})
  }
}
