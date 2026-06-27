/* eslint-disable camelcase -- RunState fields use snake_case per on-disk JSON contract */
import {Args, Command, Flags} from '@oclif/core'

import {setWorkflow} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {defaultSpawnSupervisor, enqueue} from '../engine/queue.js'
import {getDeps} from '../runtime.js'
import {getRun, putRun} from '../state/run-store.js'

/**
 * Universal entry point. Creates a Run at `queued` if none exists, validates
 * the body, then enqueues (starts immediately if a concurrency slot is free,
 * otherwise queues for later `hordr drain`).
 *
 * Replaces the old `plan` + `approve` + `run` sequence. Discovery is external;
 * bodies come pre-filled.
 */
export default class Run extends Command {
  static args = {bean: Args.string({description: 'Bean id to run', required: true})}
  static description = 'Start a bean through its workflow. Creates Run + worktree if needed.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Run)
    const beanId = args.bean

    // Create Run at queued if none exists.
    let run = getRun(beanId)
    if (!run) {
      const config = loadConfig()
      const workflow = config.routing?.default_workflow ?? 'implement'
      setWorkflow(beanId, workflow)

      const now = Math.floor(Date.now() / 1000)
      run = {
        bean: beanId,
        panes: {},
        started_unix: now,
        status: 'queued',
        step: 0,
        updated_unix: now,
        workflow,
        worktree: null,
      }
      putRun(run)
    }

    if (run.status !== 'queued') {
      this.error(`run for ${beanId} is in status '${run.status}', expected 'queued'`, {exit: 2})
    }

    const deps = getDeps()
    const outcome = enqueue(beanId, deps, defaultSpawnSupervisor)

    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, outcome}))
    } else if (outcome === 'running') {
      this.log(`started ${beanId} (supervisor pane spawned)`)
    } else {
      this.log(`queued ${beanId} (concurrency limit; run \`hordr drain\` when ready)`)
    }
  }
}
