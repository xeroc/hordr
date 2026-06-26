import {Args, Command, Flags} from '@oclif/core'

import {advance} from '../engine/advance.js'
import {getDeps} from '../runtime.js'
import {getRun, listRuns} from '../state/run-store.js'

export default class Advance extends Command {
  static args = {bean: Args.string({description: 'Bean id whose run to advance', required: false})}
  static description = 'Execute the next step of a run. Idempotent — safe to call repeatedly.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234', '<%= config.bin %> <%= command.id %> --all']
  static flags = {
    all: Flags.boolean({description: 'Advance every non-terminal run'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Advance)
    const deps = getDeps()

    if (flags.all) {
      const results: Array<{
        bean: string
        block?: boolean
        done?: boolean
        error?: string
        status?: string
        terminal?: boolean
      }> = []
      for (const r of listRuns()) {
        if (r.status === 'closed') continue
        try {
          const res = advance(r.bean, deps)
          const updated = getRun(r.bean)
          results.push({bean: r.bean, ...res, status: updated?.status})
        } catch (error) {
          results.push({bean: r.bean, error: error instanceof Error ? error.message : String(error)})
        }
      }

      if (flags.json) {
        this.log(JSON.stringify(results))
      } else {
        for (const r of results) {
          const summary = r.error ? `ERROR ${r.error}` : `done=${Boolean(r.done)} block=${Boolean(r.block)} status=${r.status ?? '?'}`
          this.log(`${r.bean}: ${summary}`)
        }
      }

      return
    }

    if (!args.bean) this.error('bean id required (or use --all)', {exit: 2})
    const beanId = args.bean
    const run = getRun(beanId)
    if (!run) this.error(`no run found for ${beanId}`, {exit: 2})
    if (run.status === 'closed') {
      this.log(`${beanId}: run is closed (terminal)`)
      return
    }

    const result = advance(beanId, deps)
    const updated = getRun(beanId)
    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, result, run: updated}))
    } else {
      this.log(
        `${beanId}: done=${result.done} block=${Boolean(result.block)} terminal=${Boolean(result.terminal)} status=${updated?.status} step=${updated?.step}`,
      )
    }
  }
}
