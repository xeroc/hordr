import {Command, Flags} from '@oclif/core'

import {activeCount, capacity} from '../engine/queue.js'
import {listRuns} from '../state/run-store.js'

export default class Status extends Command {
  static description = 'List all runs with state, step, and pane refs. Shows queue depth.'
  static examples = ['<%= config.bin %> <%= command.id %>']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Status)
    const runs = listRuns().sort((a, b) => a.started_unix - b.started_unix)

    if (flags.json) {
      this.log(
        JSON.stringify({
          queue: {
            active: activeCount(),
            capacity: capacity(),
            queued: runs.filter((r) => r.status === 'queued').length,
          },
          runs,
        }),
      )
      return
    }

    if (runs.length === 0) {
      this.log('no active runs')
      return
    }

    // ponytail: hand-rolled table, no cli-table dependency.
    const cols = ['bean', 'workflow', 'status', 'step', 'worktree', 'panes'] as const
    const rows = runs.map((r) => ({
      bean: r.bean,
      panes:
        Object.keys(r.panes).length === 0
          ? '—'
          : Object.entries(r.panes)
              .map(([role, id]) => `${role}:${id}`)
              .join(' '),
      status: r.status,
      step: `${r.step}`,
      workflow: r.workflow,
      worktree: r.worktree?.workspace_id ?? '—',
    }))

    const widths: Record<(typeof cols)[number], number> = {
      bean: 'bean'.length,
      panes: 'panes'.length,
      status: 'status'.length,
      step: 'step'.length,
      workflow: 'workflow'.length,
      worktree: 'worktree'.length,
    }
    for (const r of rows) for (const c of cols) widths[c] = Math.max(widths[c], r[c].length)

    const header = cols.map((c) => c.padEnd(widths[c])).join('  ')
    this.log(header)
    this.log('-'.repeat(header.length))
    for (const r of rows) this.log(cols.map((c) => r[c].padEnd(widths[c])).join('  '))

    const queued = runs.filter((r) => r.status === 'queued').length
    this.log('')
    this.log(`queue: ${activeCount()}/${capacity()} active, ${queued} queued`)
  }
}
