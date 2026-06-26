import {Args, Command, Flags} from '@oclif/core'

import {supervise} from '../engine/supervise.js'
import {getDeps} from '../runtime.js'
import {getRun} from '../state/run-store.js'

export default class Supervise extends Command {
  static args = {bean: Args.string({description: 'Bean id to supervise', required: true})}
  static description = 'Blocking loop: while run is not terminal, advance and wait. Runs in the supervisor pane.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    pollMs: Flags.integer({
      default: 1000,
      description: 'Polling interval between advances when step is non-blocking (milliseconds)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Supervise)
    const beanId = args.bean

    const run = getRun(beanId)
    if (!run) this.error(`no run found for ${beanId}`, {exit: 2})
    if (run.status === 'closed') {
      this.log(`${beanId}: already closed`)
      return
    }

    const deps = getDeps()
    supervise(beanId, deps, flags.pollMs)
    const final = getRun(beanId)
    this.log(`${beanId}: supervise exited (status=${final?.status ?? '?'})`)
  }
}
