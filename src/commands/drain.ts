import {Command, Flags} from '@oclif/core'

import {defaultSpawnSupervisor, drain} from '../engine/queue.js'
import {getDeps} from '../runtime.js'

export default class Drain extends Command {
  static description = 'Start queued runs until the concurrency limit is reached.'
  static examples = ['<%= config.bin %> <%= command.id %>']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Drain)
    const started = drain(getDeps(), defaultSpawnSupervisor)

    if (flags.json) {
      this.log(JSON.stringify({count: started.length, started}))
    } else if (started.length === 0) {
      this.log('queue empty (nothing to drain)')
    } else {
      this.log(`started ${started.length} run(s): ${started.join(', ')}`)
    }
  }
}
