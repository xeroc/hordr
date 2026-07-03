/**
 * HTTP/JSON daemon stub (hordr-zn3f). Minimal hordr keeps the daemon alive
 * as a /health endpoint over a unix socket so future agent-facing routes
 * can slot in without re-plumbing. Routes beyond /health return 404.
 *
 * Transport: unix socket (default $HOME/.hordr/hordr.sock, HORDR_SOCKET).
 * fs perms = auth; no token, no port allocation, no CORS.
 */
import type {IncomingMessage, ServerResponse} from 'node:http'

import {mkdirSync, unlinkSync} from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import {socketPath} from './socket.js'

export interface DaemonResponse {
  body: unknown
  status: number
}

/** Pure route handler. /health only; everything else 404. */
export function handleRequest(method: string, urlPath: string): DaemonResponse {
  if (method === 'GET' && urlPath === '/health') return {body: {ok: true}, status: 200}
  return {body: {error: `unknown route: ${method} ${urlPath}`}, status: 404}
}

export function createListener() {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const {body: respBody, status} = handleRequest(req.method ?? 'GET', req.url ?? '/')
    const json = JSON.stringify(respBody)
    res.writeHead(status, {'Content-Length': Buffer.byteLength(json), 'Content-Type': 'application/json'})
    res.end(json)
  }
}

export interface DaemonServer {
  close(): Promise<void>
  path: string
}

export function startServer(opts?: {path?: string}): Promise<DaemonServer> {
  const sockPath = opts?.path ?? socketPath()
  const server = http.createServer(createListener())

  return new Promise((resolve, reject) => {
    const doListen = () => {
      server.once('error', reject)
      server.listen(sockPath, () => {
        server.removeListener('error', reject)
        resolve(makeHandle(server, sockPath))
      })
    }

    try {
      mkdirSync(path.dirname(sockPath), {recursive: true})
    } catch {
      /* ignore — listen() surfaces the real error */
    }

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Stale socket from a crashed daemon. Retry once after unlinking.
        try {
          unlinkSync(sockPath)
        } catch {
          /* ignore */
        }

        doListen()
        return
      }

      reject(err)
    })

    doListen()
  })
}

function makeHandle(server: http.Server, sockPath: string): DaemonServer {
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          try {
            unlinkSync(sockPath)
          } catch {
            /* ignore */
          }

          resolve()
        })
      }),
    path: sockPath,
  }
}

/** Wire SIGTERM/SIGINT to clean shutdown. */
export function installSignalHandlers(server: DaemonServer): void {
  let shuttingDown = false
  const shutdown = (sig: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return
    shuttingDown = true
    server.close().then(() => {
      // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- daemon is the CLI; signal-driven exit is its lifecycle
      process.exit(sig === 'SIGINT' ? 130 : 0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}
