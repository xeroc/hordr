import {Command, Flags} from '@oclif/core'

import {closeMerged} from '../engine/close-merged.js'
import {getDeps} from '../runtime.js'

export default class CloseMerged extends Command {
  static description = 'Scan runs in pr-open state; for each merged PR: mark bean completed and remove worktree.'
  static examples = ['<%= config.bin %> <%= command.id %>']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CloseMerged)
    const result = closeMerged(getDeps())

    if (flags.json) {
      this.log(JSON.stringify(result))
      return
    }

    if (result.closed.length === 0 && result.skipped.length === 0 && result.failed.length === 0) {
      this.log('no pr-open runs to scan')
      return
    }

    if (result.closed.length > 0) this.log(`closed ${result.closed.length}: ${result.closed.join(', ')}`)
    if (result.skipped.length > 0)
      this.log(`skipped ${result.skipped.length} (PR still open): ${result.skipped.join(', ')}`)
    if (result.failed.length > 0) this.log(`failed ${result.failed.length} (gh error): ${result.failed.join(', ')}`)
  }
}
