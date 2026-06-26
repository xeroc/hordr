import {Command, Flags} from '@oclif/core'

export default class OnWorktreeRemoved extends Command {
  static description = 'Event hook: fired by herdr on worktree.removed.'
  static examples = ['<%= config.bin %> <%= command.id %>']
  static flags = {
    branch: Flags.string({description: 'Worktree branch name'}),
    workspace: Flags.string({description: 'Herdr workspace id'}),
  }

  async run(): Promise<void> {
    await this.parse(OnWorktreeRemoved)
    // No-op stub. Wired up by herdr-plugin.toml [[events]] on = "worktree.removed".
  }
}
