import {Args, Command, Flags} from '@oclif/core'

export default class Advance extends Command {
  static args = {
    bean: Args.string({description: 'Bean id whose run to advance', required: false}),
  }
  static description = 'Execute the next step of a run. Idempotent — safe to call repeatedly.'
  static examples = [
    '<%= config.bin %> <%= command.id %> hordr-1234',
    '<%= config.bin %> <%= command.id %> --all',
  ]
  static flags = {
    all: Flags.boolean({description: 'Advance every non-terminal run'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Advance)
    const target = flags.all ? 'all' : args.bean ?? ''
    this.error(`not implemented: advance ${target}`, {exit: 2})
  }
}
