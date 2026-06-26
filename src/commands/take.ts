import {Args, Command} from '@oclif/core'
import {execFileSync} from 'node:child_process'

import {getRun} from '../state/run-store.js'

export default class Take extends Command {
  static args = {bean: Args.string({description: 'Bean id to take over', required: true})}
  static description = 'Focus the blocked pane for interactive recovery. Run stays blocked until advance.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Take)
    const beanId = args.bean

    const run = getRun(beanId)
    if (!run) this.error(`no run found for ${beanId}`, {exit: 2})
    if (run.status !== 'blocked') {
      this.error(`run for ${beanId} is not blocked (status: ${run.status})`, {exit: 2})
    }

    // ponytail: pick the last-recorded agent pane. Insertion order reflects
    // role-spawn order, so this is usually the most recently blocked pane. If
    // multiple are blocked, the human can tab-cycle in herdr's TUI.
    const paneIds = Object.values(run.panes)
    if (paneIds.length === 0) {
      this.error(`run for ${beanId} has no panes recorded`, {exit: 2})
    }

    const targetPaneId = paneIds.at(-1)!
    // Read HERDR_BIN_PATH at call time so tests can redirect to /bin/true.
    const herdrBin = process.env.HERDR_BIN_PATH ?? 'herdr'

    try {
      execFileSync(herdrBin, ['pane', 'zoom', targetPaneId, '--on'], {stdio: 'inherit'})
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.error(`failed to focus pane ${targetPaneId}: ${msg}`, {exit: 1})
    }

    this.log(`focused pane ${targetPaneId} for ${beanId}`)
    this.log(`run stays blocked; when ready, run \`hordr advance ${beanId}\` to resume`)
  }
}
