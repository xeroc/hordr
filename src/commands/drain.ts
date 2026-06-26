import {Command} from '@oclif/core'

export default class Drain extends Command {
  static description = 'Start queued runs until the concurrency limit is reached.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await this.parse(Drain)
    this.error('not implemented: drain', {exit: 2})
  }
}
