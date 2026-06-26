/* eslint-disable camelcase -- started_unix/updated_unix/workspace_id mirror SPEC.md §3 JSON fields */
import {Args, Command, Flags} from '@oclif/core'

import type {RunState} from '../state/schema.js'

import {getBean, setWorkflow} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {advance} from '../engine/advance.js'
import {getDeps} from '../runtime.js'
import {getRun, putRun} from '../state/run-store.js'

export default class Plan extends Command {
  static args = {bean: Args.string({description: 'Bean id to plan', required: true})}
  static description = 'Create a Run, spawn planner pane, draft spec. Bean transitions to draft.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Plan)
    const beanId = args.bean

    const bean = getBean(beanId)
    if (bean.status !== 'todo') {
      this.error(`bean ${beanId} is in status '${bean.status}', expected 'todo'`, {exit: 2})
    }

    if (getRun(beanId)) {
      this.error(`run already exists for ${beanId} (status: ${getRun(beanId)!.status})`, {exit: 2})
    }

    const workflowName = loadConfig().routing?.plan_workflow ?? 'plan'
    setWorkflow(beanId, workflowName)

    const now = Math.floor(Date.now() / 1000)
    const run: RunState = {
      bean: beanId,
      panes: {},
      started_unix: now,
      status: 'planning',
      step: 0,
      updated_unix: now,
      workflow: workflowName,
      worktree: null,
    }
    putRun(run)

    const deps = getDeps()
    const wt = deps.createWorktree(beanId)
    putRun({...run, worktree: {branch: wt.branch, workspace_id: wt.workspaceId}})

    // Runs draft-spec step: spawns planner, waits for done, sets bean→draft,
    // transitions run→awaiting-approval.
    advance(beanId, deps)

    const finalRun = getRun(beanId)
    if (flags.json) {
      this.log(JSON.stringify({advance: {done: true}, bean: beanId, run: finalRun}))
    } else {
      this.log(`planned ${beanId}: run status=${finalRun?.status}, step=${finalRun?.step}`)
      this.log(`spec drafted; review and run \`hordr approve ${beanId}\` when ready`)
    }
  }
}
