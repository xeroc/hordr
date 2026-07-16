import {Command, Flags} from '@oclif/core'
import {execFileSync, spawn} from 'node:child_process'

import {getBean} from '../beans/client.js'
import {loadConfig} from '../config/loader.js'
import {type BrokerHandle, wireDaemon} from '../daemon/broker.js'
import {installSignalHandlers, startServer} from '../daemon/server.js'
import {socketPath} from '../daemon/socket.js'
import {runDoneChecks} from '../dispatch/done.js'
import {createFleetEngine} from '../dispatch/engine.js'
import {configureLogger, logger} from '../logger.js'
import {openFleetDb} from '../storage/db.js'
import {findLaneByTask, setLaneCurrentTask} from '../storage/fleets.js'

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
    const db = openFleetDb()
    const engine = createFleetEngine(config)

    const server = await startServer({path: sock})
    installSignalHandlers(server)
    const broker: BrokerHandle = wireDaemon({
      db,
      engine,
      releaseTask(taskId) {
        const lane = findLaneByTask(db, taskId)
        if (!lane) return false
        const loc = {epicId: lane.epicBeanId, milestoneId: lane.fleetMilestoneBeanId, projectKey: lane.projectKey}
        setLaneCurrentTask(db, loc, null)
        logger.info(`lane ${lane.epicBeanId}: task ${taskId} released (agent reported blocked) — lane stays active`)
        return true
      },
      // /done acceptance gate (hordr-w8w2): verify the worktree is clean and
      // the bean is completed before acking. Specific failures are surfaced to
      // the agent via the 409 body so it can fix and retry. If no lane owns the
      // task, the heal poll already verified clean+completed → runDoneChecks
      // acks OK (idempotent).
      verify(taskId) {
        return runDoneChecks(taskId, {
          beanStatus: (id, cwd) => String(getBean(id, {cwd}).status ?? ''),
          dirtyPaths: (cwd) => gitStatusPorcelain(cwd),
          worktreePath: (id) => findLaneByTask(db, id)?.worktreePath,
        })
      },
    })
    installBrokerShutdown(broker)

    logger.info(`listening on ${server.path}`)
    logger.info(`routes: GET /health, POST /done, POST /blocked`)
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

/**
 * Non-empty `git status --porcelain` lines in a worktree (empty = clean). On
 * git failure (broken/missing worktree) returns a sentinel so /done fails loud
 * instead of silently acking a broken state — mirrors dirtyNonBeansPaths.
 */
function gitStatusPorcelain(cwd: string): string[] {
  let raw = ''
  try {
    raw = execFileSync('git', ['-C', cwd, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ['<git status failed>']
  }

  return raw.split('\n').filter((l) => l.trim().length > 0)
}
