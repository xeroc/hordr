/* eslint-disable camelcase -- RunState fields mirror the on-disk snake_case JSON contract */
import {Args, Command, Flags} from '@oclif/core'
import {execFileSync} from 'node:child_process'

import {getBean, setWorkflow} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {enqueue} from '../engine/queue.js'
import {getDeps} from '../runtime.js'
import {getRun, putRun} from '../state/run-store.js'

/**
 * Universal entry point. Creates a Run, creates a worktree, spawns the first
 * agent. The agent self-triggers subsequent steps via `hordr advance <bean>`.
 *
 * Routing: if the bean has children (via beans list --parent), use the
 * coordinator workflow. Otherwise use the default (implement) workflow.
 * Both get worktrees.
 *
 * No supervisor pane. No detached process. The agent IS the driver.
 */
export default class Run extends Command {
  static args = {bean: Args.string({description: 'Bean id to run', required: true})}
  static description = 'Start a bean through its workflow. Creates Run + worktree, spawns first agent.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    base: Flags.string({description: 'Base ref/branch for the worktree (defaults to config.primary_branch)'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Run)
    const beanId = args.bean

    // Create Run at queued if none exists.
    let run = getRun(beanId)
    if (!run) {
      const config = loadConfig()
      // Validate the bean exists + is well-formed before creating the Run.
      getBean(beanId)

      // Route: children → coordinator, no children → default workflow.
      const hasChildren = this._hasChildren(beanId)
      const workflow = hasChildren ? 'coordinator' : config.routing?.default_workflow ?? 'implement'
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

    // Create worktree if the workflow requests one.
    const config = loadConfig()
    const wf = config.workflows[run.workflow]
    if (wf?.worktree && !run.worktree) {
      const deps = getDeps()
      const wt = deps.createWorktree(beanId, flags.base ? {base: flags.base} : undefined)
      putRun({
        ...run,
        worktree: {branch: wt.branch, path: wt.path, workspace_id: wt.workspaceId},
      })
    }

    // Enqueue: transitions to running + spawns first agent via advance.
    const outcome = enqueue(beanId, getDeps())
    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, outcome}))
    } else if (outcome === 'running') {
      this.log(`started ${beanId}`)
    } else {
      this.log(`queued ${beanId} (concurrency limit; run \`hordr drain\` when ready)`)
    }
  }

  /** Check if a bean has children via beans list --parent. */
  private _hasChildren(beanId: string): boolean {
    try {
      const out = execFileSync('beans', ['list', '--parent', beanId, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const data = JSON.parse(out) as unknown[]
      return data.length > 0
    } catch {
      return false
    }
  }
}
