/* eslint-disable camelcase -- task_id mirrors the JSON contract the agent parses */
import {Args, Command} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type DaemonResponse, handleDone, runDoneChecks} from '../dispatch/done.js'
import {createFleetEngine} from '../dispatch/engine.js'
import {openFleetDb} from '../storage/db.js'
import {findLaneByTask} from '../storage/fleets.js'
import {getVcsOrMock} from '../vcs/resolve.js'

/**
 * hordr done <task-id>
 *
 * Called by the agent after it commits and marks the bean completed. Runs the
 * acceptance gate inline (verify clean + completed), then continuation: finds
 * the next dispatchable bean in the lane and returns it to the LIVE agent so
 * it keeps working in-place — no re-spawn (ADR-0015, formerly the /done route).
 *
 * Lock-free: writes are lane-local (each lane owns its worktree's beans dir),
 * so concurrent `hordr done` calls from sibling lanes touch disjoint state.
 */
export default class Done extends Command {
  static args = {task: Args.string({description: 'Task bean id that was completed', required: true})}
  static description = 'Notify the lane that a task is done (agent-facing).'
  static examples = ['<%= config.bin %> done hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Done)
    const taskId = args.task

    const config = loadConfig()
    const vcs = getVcsOrMock(config)
    const db = openFleetDb()
    const engine = createFleetEngine(config)

    const response = handleDone(
      {task_id: taskId},
      {
        continue: (id) => engine.continueTask(db, id),
        verify: (id) =>
          runDoneChecks(id, {
            beanStatus: (bid, cwd) => String(getBean(bid, {cwd}).status ?? ''),
            dirtyPaths: (cwd) => vcs.dirtyPaths(cwd),
            worktreePath: (bid) => findLaneByTask(db, bid)?.worktreePath,
          }),
      },
    )

    db.close()

    const {exitCode, stdout} = mapDoneResponse(response)
    this.log(stdout)
    if (exitCode !== 0) process.exitCode = exitCode
  }
}

/** Pure response→stdout/exit mapping. Agent always gets structured JSON; exit code signals success. */
export function mapDoneResponse(response: DaemonResponse): {exitCode: number; stdout: string} {
  return {exitCode: response.status === 200 ? 0 : 2, stdout: JSON.stringify(response.body)}
}
