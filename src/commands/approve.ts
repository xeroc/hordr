import {Args, Command, Flags} from '@oclif/core'

import {getBody, getStatus, setStatus} from '../beans/client.js'
import {validateSpec} from '../beans/validate-spec.js'
import {enqueue} from '../engine/queue.js'
import {transition} from '../engine/run.js'
import {getDeps} from '../runtime.js'
import {getRun, putRun} from '../state/run-store.js'

export default class Approve extends Command {
  static args = {bean: Args.string({description: 'Bean id to approve', required: true})}
  static description = 'HITL gate: validate-spec, then bean draft -> todo. Run -> queued.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Approve)
    const beanId = args.bean

    const status = getStatus(beanId)
    if (status !== 'draft') {
      this.error(`bean ${beanId} is in status '${status}', expected 'draft'`, {exit: 2})
    }

    const result = validateSpec(getBody(beanId))
    if (!result.valid) {
      const msg = [
        result.missing.length > 0 ? `missing: ${result.missing.join(', ')}` : '',
        result.empty.length > 0 ? `empty: ${result.empty.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ')
      this.error(`spec invalid \u2014 ${msg}`, {exit: 1})
    }

    setStatus(beanId, 'todo')

    const run = getRun(beanId)
    if (!run) {
      this.error(`no run found for ${beanId} (did you \`hordr plan\` first?)`, {exit: 2})
    }

    const queuedRun = transition(run, 'queued')
    putRun(queuedRun)

    const outcome = enqueue(beanId, getDeps())

    if (flags.json) {
      this.log(
        JSON.stringify({
          bean: beanId,
          beanStatus: 'todo',
          queued: outcome === 'queued',
          runStatus: outcome === 'running' ? 'running' : queuedRun.status,
        }),
      )
    } else {
      this.log(`approved ${beanId}: bean \u2192 todo, run \u2192 ${outcome === 'running' ? 'running' : 'queued'}`)
      if (outcome === 'running') this.log('workflow started')
      else this.log('queued (concurrency limit reached; run `hordr drain` when ready)')
    }
  }
}
