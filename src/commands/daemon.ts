import {Command, Flags} from '@oclif/core'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type BrokerHandle, createTickDepsFactory, wireDaemon} from '../daemon/broker.js'
import {installSignalHandlers, startServer} from '../daemon/server.js'
import {socketPath} from '../daemon/socket.js'
import {configureLogger, logger} from '../logger.js'
import {openFleetDb} from '../storage/db.js'

/**
 * The hordr daemon: a unix-socket server (health + /done) plus the broker tick
 * loop that drives every active fleet. Run until SIGTERM/SIGINT. `fleet create`
 * lazy-starts this (detached, logs suppressed); run with --foreground to see
 * logs in the terminal.
 */
export default class Daemon extends Command {
  static description = 'Run the hordr daemon (broker tick loop + /done route).'
  static examples = [
    '<%= config.bin %> daemon --foreground',
    '<%= config.bin %> daemon --foreground --log-level debug',
    'HORDR_TICK_MS=2000 <%= config.bin %> daemon --foreground',
  ]
  static flags = {
    foreground: Flags.boolean({
      default: false,
      description: 'Stay in foreground with visible logs (default: detached, logs suppressed)',
    }),
    'log-level': Flags.string({
      default: 'info',
      description: 'Log level: error, warn, info, debug',
      options: ['error', 'warn', 'info', 'debug'],
    }),
    socket: Flags.string({description: 'Unix socket path (default: $HORDR_SOCKET or ~/.hordr/hordr.sock)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Daemon)
    const sock = flags.socket ?? socketPath()

    // Silent when detached (fleet create auto-start); visible when --foreground
    configureLogger({level: flags['log-level'], silent: !flags.foreground})

    logger.info(`hordr daemon starting (log level: ${flags['log-level']})`)

    const config = loadConfig()
    const cwd = process.cwd()
    const db = openFleetDb()
    const depsFactory = createTickDepsFactory(config, cwd)

    const server = await startServer({path: sock})
    installSignalHandlers(server)
    const broker: BrokerHandle = wireDaemon({
      db,
      depsFactory,
      verifyCompleted: (taskId) => getBean(taskId, {cwd}).status === 'completed',
    })
    installBrokerShutdown(broker)

    logger.info(`listening on ${server.path}`)
    logger.info(`routes: GET /health, POST /done`)
    logger.info(`broker tick: every ${process.env.HORDR_TICK_MS ?? '5000'}ms`)

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
