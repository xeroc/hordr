/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
import {Args, Command} from '@oclif/core'
import http from 'node:http'

import {socketPath} from '../daemon/socket.js'

/**
 * hordr done <task-id>
 *
 * Called by the agent after it commits and marks the bean completed.
 * POSTs {task_id} to the daemon's /done route over the unix socket.
 * The daemon verifies completion and advances the lane on the next tick.
 */
export default class Done extends Command {
  static args = {task: Args.string({description: 'Task bean id that was completed', required: true})}
  static description = 'Notify the fleet that a task is done (agent-facing).'
  static examples = ['<%= config.bin %> done hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Done)
    const taskId = args.task
    const sock = socketPath()

    const body = JSON.stringify({task_id: taskId})

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          headers: {'Content-Length': Buffer.byteLength(body), 'Content-Type': 'application/json'},
          method: 'POST',
          path: '/done',
          socketPath: sock,
        },
        (res) => {
          let buf = ''
          res.setEncoding('utf8')
          res.on('data', (c: string) => {
            buf += c
          })
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve()
            } else {
              try {
                const parsed = JSON.parse(buf) as {error?: string}
                reject(new Error(parsed.error ?? `HTTP ${res.statusCode}`))
              } catch {
                reject(new Error(`HTTP ${res.statusCode}: ${buf}`))
              }
            }
          })
        },
      )
      req.on('error', (error) => {
        reject(new Error(`daemon not reachable (${error.message}). Is 'hordr daemon' running?`))
      })
      req.write(body)
      req.end()
    })
  }
}
