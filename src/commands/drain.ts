import {Command, Flags} from '@oclif/core'
import {spawn} from 'node:child_process'

import {defaultSpawnSupervisor, drain} from '../engine/queue.js'
import {getDeps} from '../runtime.js'

// ponytail: HERDR_BIN_PATH lets tests point the detached supervisor spawn at a
// no-op binary (/bin/true). Prod leaves it unset → real `hordr supervise`.
function spawnSupervisor(beanId: string): void {
  const bin = process.env.HERDR_BIN_PATH
  if (bin) {
    spawn(bin, ['supervise', beanId], {detached: true, stdio: 'ignore'}).unref()
    return
  }

  defaultSpawnSupervisor(beanId)
}

export default class Drain extends Command {
  static description = 'Start queued runs until the concurrency limit is reached.'
  static examples = ['<%= config.bin %> <%= command.id %>']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Drain)
    const started = drain(getDeps(), spawnSupervisor)

    if (flags.json) {
      this.log(JSON.stringify({count: started.length, started}))
    } else if (started.length === 0) {
      this.log('queue empty (nothing to drain)')
    } else {
      this.log(`started ${started.length} run(s): ${started.join(', ')}`)
    }
  }
}
