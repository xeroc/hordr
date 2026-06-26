import {Args, Command} from '@oclif/core'

export default class ValidateSpec extends Command {
  static args = {
    bean: Args.string({description: 'Bean id whose body to validate', required: true}),
  }
  static description = 'Check the 4 body sections are present and non-empty. Exit 0 if valid, 1 if not.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(ValidateSpec)
    this.error(`not implemented: validate-spec ${args.bean}`, {exit: 2})
  }
}
