import {Command} from '@oclif/core'

export default class CloseMerged extends Command {
  static description = 'Scan runs in pr-open state; for each merged PR: mark bean completed and remove worktree.'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await this.parse(CloseMerged)
    this.error('not implemented: close-merged', {exit: 2})
  }
}
