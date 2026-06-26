import {Args, Command, Flags} from '@oclif/core'
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- readline/promises is stable in practice; project runs Node >=18.
import {createInterface} from 'node:readline/promises'

import {setStatus} from '../beans/client.js'
import {getDeps} from '../runtime.js'
import {deleteRun, getRun} from '../state/run-store.js'

export default class Reset extends Command {
  static args = {bean: Args.string({description: 'Bean id to reset', required: true})}
  static description = 'Delete run state, worktree, and branch. Bean reverts to todo.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    force: Flags.boolean({char: 'f', description: 'Skip confirmation prompt'}),
    json: Flags.boolean({default: false, description: 'Emit machine-parseable JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Reset)
    const beanId = args.bean

    const run = getRun(beanId)
    if (!run) {
      this.error(`no run found for ${beanId}`, {exit: 2})
    }

    if (!flags.force) {
      // Read process.stdin at call time (not import time) so tests can swap it.
      const rl = createInterface({input: process.stdin, output: process.stdout})
      try {
        const answer = await rl.question(`Reset ${beanId}? This deletes run state, worktree, and branch. [y/N] `)
        if (answer.trim().toLowerCase() !== 'y') {
          this.log('aborted')
          return
        }
      } finally {
        rl.close()
      }
    }

    const deps = getDeps()

    // 1. Remove worktree. Warn but continue if it's already gone (manual cleanup).
    if (run.worktree) {
      try {
        deps.removeWorktree(run.worktree.workspace_id)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        this.warn(`worktree removal failed (continuing): ${msg}`)
      }
    }

    // 2. Delete run state.
    deleteRun(beanId)

    // 3. Bean → todo.
    setStatus(beanId, 'todo')

    if (flags.json) {
      this.log(JSON.stringify({bean: beanId, reset: true}))
    } else {
      this.log(`reset ${beanId}: state deleted, worktree removed, bean → todo`)
    }
  }
}
