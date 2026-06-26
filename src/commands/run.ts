import {Args, Command, Flags} from '@oclif/core'
import {spawn} from 'node:child_process'

import {getStatus} from '../beans/client.js'
import {defaultSpawnSupervisor, enqueue} from '../engine/queue.js'
import {getDeps} from '../runtime.js'
import {getRun} from '../state/run-store.js'

// ponytail: HERDR_BIN_PATH lets tests point the detached supervisor spawn at a
// no-op binary (/bin/true). Prod leaves it unset → real `hordr supervise`.
// Matches the pattern in commands/drain.ts.
function spawnSupervisor(beanId: string): void {
  const bin = process.env.HERDR_BIN_PATH
  if (bin) {
    spawn(bin, ['supervise', beanId], {detached: true, stdio: 'ignore'}).unref()
    return
  }

  defaultSpawnSupervisor(beanId)
}

export default class Run extends Command {
  static args = {bean: Args.string({description: 'Bean id to enqueue', required: true})}
  static description = 'Enqueue bean; drain queue if a slot is available. Spawns the supervisor pane.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Run)
    const beanId = args.bean

    if (getStatus(beanId) !== 'todo') {
      this.error(
        `bean ${beanId} is not approved (status not 'todo'); run \`hordr plan\` then \`hordr approve\` first`,
        {exit: 2},
      )
    }

    const run = getRun(beanId)
    if (!run) {
      this.error(`no run found for ${beanId}; run \`hordr plan\` first`, {exit: 2})
    }

    if (run.status !== 'queued') {
      this.error(`run for ${beanId} is in status '${run.status}', expected 'queued'`, {exit: 2})
    }

    const deps = getDeps()
    const outcome = enqueue(beanId, deps, spawnSupervisor)

    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, outcome}))
    } else if (outcome === 'running') {
      this.log(`started ${beanId} (supervisor pane spawned)`)
    } else {
      this.log(`queued ${beanId} (concurrency limit; run \`hordr drain\` when ready)`)
    }
  }
}
