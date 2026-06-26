import {Args, Command} from '@oclif/core'

export default class Approve extends Command {
  static args = {
    bean: Args.string({description: 'Bean id to approve', required: true}),
  }
  static description = 'HITL gate: validate-spec, then bean draft -> todo. Run -> queued.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Approve)
    this.error(`not implemented: approve ${args.bean}`, {exit: 2})
  }
}
