import {Command, Flags} from '@oclif/core'
import {spawn} from 'node:child_process'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type BrokerHandle, createTickDepsFactory, wireDaemon} from '../daemon/broker.js'
import {installSignalHandlers, startServer} from '../daemon/server.js'
import {socketPath} from '../daemon/socket.js'
import {configureLogger, logger} from '../logger.js'
import {openFleetDb} from '../storage/db.js'

/**
 * The hordr daemon: a unix-socket server (health + /done) plus the broker tick
 * loop that drives every active fleet.
 *
 * Default: detaches into background (releases the shell). The actual daemon
 * runs as a spawned child with --foreground --log-level error.
 * --foreground: stays in the terminal with visible logs.
 */
export default class Daemon extends Command {
  static description = 'Run the hordr daemon (broker tick loop + /done route).'
  static examples = [
    '<%= config.bin %> daemon                    # background, releases shell',
    '<%= config.bin %> daemon --foreground       # foreground with logs',
    '<%= config.bin %> daemon --foreground --log-level debug',
  ]
  static flags = {
    foreground: Flags.boolean({
      default: false,
      description: 'Stay in foreground with visible logs',
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

    // Without --foreground: spawn a detached child and exit immediately.
    if (!flags.foreground) {
      const child = spawn(process.argv[1]!, ['daemon', '--foreground', '--log-level', 'error'], {
        detached: true,
        env: {...process.env},
        stdio: 'ignore',
      })
      child.unref()
      this.log(`hordr daemon started in background (pid ${child.pid})`)
      return
    }

    // Foreground mode: stay in the terminal with logs.
    const sock = flags.socket ?? socketPath()
    configureLogger({level: flags['log-level'], silent: false})

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
