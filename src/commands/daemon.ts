import {Command, Flags} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type BrokerHandle, createTickDeps, wireDaemon} from '../daemon/broker.js'
import {installSignalHandlers, startServer} from '../daemon/server.js'
import {socketPath} from '../daemon/socket.js'
import {openFleetDb} from '../storage/db.js'

/**
 * The hordr daemon: a unix-socket server (health + /done) plus the broker tick
 * loop that drives every active fleet. Run until SIGTERM/SIGINT. `fleet create`
 * lazy-starts this; it can also be run directly.
 */
export default class Daemon extends Command {
  static description = 'Run the hordr daemon (broker tick loop + /done route).'
  static examples = ['<%= config.bin %> daemon', 'HORDR_TICK_MS=2000 <%= config.bin %> daemon']
  static flags = {
    socket: Flags.string({description: 'Unix socket path (default: $HORDR_SOCKET or ~/.hordr/hordr.sock)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Daemon)
    const sock = flags.socket ?? socketPath()

    const config = loadConfig()
    const cwd = process.cwd()
    const db = openFleetDb()
    const deps = createTickDeps(config, cwd)

    const server = await startServer({path: sock})
    installSignalHandlers(server)
    const broker: BrokerHandle = wireDaemon({
      db,
      deps,
      verifyCompleted: (taskId) => getBean(taskId, {cwd}).status === 'completed',
    })
    installBrokerShutdown(broker)

    this.log(`hordr daemon listening on ${server.path}`)
    this.log(`routes: GET /health, POST /done`)
    this.log(`broker tick: every ${process.env.HORDR_TICK_MS ?? '5000'}ms`)

    // ponytail: keep the process alive waiting for signal.
    await new Promise<void>(() => {})
  }
}

/** Ensure the broker timer stops on signal alongside the socket server. */
function installBrokerShutdown(broker: BrokerHandle): void {
  const stop = () => broker.stop()
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
