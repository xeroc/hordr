import {Command, Flags} from '@oclif/core'

import {installSignalHandlers, startServer} from '../daemon/server.js'
import {socketPath} from '../daemon/socket.js'

/**
 * Stub daemon (hordr-zn3f). Keeps the unix socket alive so future
 * agent-facing routes can slot in without re-plumbing. Currently answers
 * /health only. Run until SIGTERM/SIGINT.
 */
export default class Daemon extends Command {
  static description = 'Run the hordr daemon stub (health endpoint only; grows later).'
  static examples = ['<%= config.bin %> daemon', 'HORDR_SOCKET=/tmp/hordr.sock <%= config.bin %> daemon']
  static flags = {
    socket: Flags.string({description: 'Unix socket path (default: $HORDR_SOCKET or ~/.hordr/hordr.sock)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Daemon)
    const sock = flags.socket ?? socketPath()

    const server = await startServer({path: sock})
    installSignalHandlers(server)
    this.log(`hordr daemon listening on ${server.path}`)
    this.log('route: GET /health  (more routes return later)')

    // ponytail: keep the process alive waiting for signal. The http server
    // holds the event loop open; this is a clarity marker.
    await new Promise<void>(() => {})
  }
}
