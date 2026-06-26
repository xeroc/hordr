import {Command} from '@oclif/core'

export default class Status extends Command {
  static description = 'List all runs with state, step, and pane refs. Shows queue depth.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await this.parse(Status)
    this.error('not implemented: status', {exit: 2})
  }
}
