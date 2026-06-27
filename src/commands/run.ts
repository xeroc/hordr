import {Args, Command, Flags} from '@oclif/core'
/* eslint-disable camelcase -- RunState worktree + started_unix/updated_unix fields mirror the on-disk JSON contract */
import {spawn} from 'node:child_process'
import process from 'node:process'

import type {RunState} from '../state/schema.js'

import {getBean, getBody, getStatus, setWorkflow} from '../beans/client.js'
import {validateSpec} from '../beans/validate-spec.js'
import {loadConfig} from '../config/loader.js'
import {defaultSpawnSupervisor, enqueue} from '../engine/queue.js'
import {getDeps} from '../runtime.js'
import {getRun, putRun} from '../state/run-store.js'

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

/**
 * Returns the parent bean if this bean has one and the parent is a completed
 * epic. Otherwise null. Ponytail: two bean reads, no caching.
 */
function completedEpicParent(beanId: string): null | {id: string; title: string} {
  const bean = getBean(beanId)
  // beans GraphQL exposes parentId; the JSON from `beans show --json` includes
  // parent_id in the bean record if set.
  const parentId = (bean as {parent_id?: string}).parent_id
  if (!parentId) return null

  const parent = getBean(parentId)
  if (parent.type === 'epic' && parent.status === 'completed') {
    return {id: parentId, title: parent.title}
  }

  return null
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
    const bean = getBean(beanId)

    // Body must be valid before starting — protects against half-decomposed children.
    const bodyValidation = validateSpec(getBody(beanId), bean.type as 'epic' | 'task')
    if (!bodyValidation.valid) {
      const detail = [
        bodyValidation.missing.length > 0 ? `missing: ${bodyValidation.missing.join(', ')}` : '',
        bodyValidation.empty.length > 0 ? `empty: ${bodyValidation.empty.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ')
      this.error(`bean ${beanId} body invalid — ${detail}`, {exit: 1})
    }

    // ADR-0010: decomposed children (parent is a completed epic) skip planning.
    // They enter the Run SM directly at 'queued' — no prior `hordr plan` needed.
    const epicParent = completedEpicParent(beanId)
    const existingRun = getRun(beanId)

    if (epicParent && !existingRun) {
      // Child of a completed epic with no Run yet → create at queued (ADR-0010).
      if (bean.status !== 'todo') {
        this.error(`bean ${beanId} status is '${bean.status}', expected 'todo'`, {exit: 2})
      }

      const config = loadConfig()
      const workflow = config.routing?.default_workflow ?? 'implement'
      setWorkflow(beanId, workflow)

      const now = Math.floor(Date.now() / 1000)
      const run: RunState = {
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
    } else {
      // Standalone task path: require prior plan + approve.
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
    }

    const deps = getDeps()
    const outcome = enqueue(beanId, deps, spawnSupervisor)

    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, decomposedChild: Boolean(epicParent), outcome}))
    } else if (outcome === 'running') {
      this.log(`started ${beanId} (supervisor pane spawned)`)
    } else {
      this.log(`queued ${beanId} (concurrency limit; run \`hordr drain\` when ready)`)
    }
  }
}
