/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
import {Args, Command} from '@oclif/core'
import http from 'node:http'

import {socketPath} from '../daemon/socket.js'

/**
 * hordr blocked <task-id>
 *
 * Called by the agent when it discovers the task is blocked by unmet
 * dependencies. POSTs {task_id, reason} to the daemon's /blocked route.
 * The daemon releases the lane (clears currentTaskBeanId) so it can
 * dispatch other work. The task stays in its current status and will be
 * re-dispatched once its blockers resolve.
 */
export default class Blocked extends Command {
  static args = {task: Args.string({description: 'Task bean id that is blocked', required: true})}
  static description = 'Notify the fleet that a task is blocked by unmet dependencies (agent-facing).'
  static examples = ['<%= config.bin %> blocked hordr-1234']

  async run(): Promise<void> {
    const {args} = await this.parse(Blocked)
    const taskId = args.task
    const sock = socketPath()

    const body = JSON.stringify({reason: 'dependencies not met', task_id: taskId})

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          headers: {'Content-Length': Buffer.byteLength(body), 'Content-Type': 'application/json'},
          method: 'POST',
          path: '/blocked',
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
