/**
 * HTTP/JSON daemon over a unix socket (ADR-0012).
 *
 * Extensible route registry: built-in /health, plus addRoute for the broker
 * routes (/done, fleet status, etc.). Transport: unix socket
 * ($HORDR_SOCKET, default ~/.hordr/hordr.sock). fs perms = auth.
 */
import type {IncomingMessage, ServerResponse} from 'node:http'

import {mkdirSync, unlinkSync} from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import {socketPath} from './socket.js'

export interface DaemonRequest {
  body: unknown
  method: string
  path: string
}

export interface DaemonResponse {
  body: unknown
  status: number
}

type RouteHandler = (req: DaemonRequest) => DaemonResponse

interface Route {
  handler: RouteHandler
  method: string
  path: string
}

// Built-in routes. /health is always present.
const builtinRoutes: Route[] = [{handler: () => ({body: {ok: true}, status: 200}), method: 'GET', path: '/health'}]

// User-registered routes (broker routes added at daemon startup).
const userRoutes: Route[] = []

/** Register a route. Called at daemon startup to wire broker endpoints. */
export function addRoute(method: string, path: string, handler: RouteHandler): void {
  userRoutes.push({handler, method, path})
}

/** Clear user-registered routes (keeps /health). Used in tests. */
export function resetRoutes(): void {
  userRoutes.length = 0
}

/** Pure route dispatcher. */
export function handleRequest(method: string, urlPath: string, body?: unknown): DaemonResponse {
  const routes = [...builtinRoutes, ...userRoutes]
  const route = routes.find((r) => r.method === method && r.path === urlPath)
  if (route) return route.handler({body, method, path: urlPath})
  return {body: {error: `unknown route: ${method} ${urlPath}`}, status: 404}
}

export function createListener() {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readBody(req)
    const {body: respBody, status} = handleRequest(req.method ?? 'GET', req.url ?? '/', body)
    const json = JSON.stringify(respBody)
    res.writeHead(status, {'Content-Length': Buffer.byteLength(json), 'Content-Type': 'application/json'})
    res.end(json)
  }
}

/** Read and JSON-parse the request body (empty for GET). */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let buf = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      buf += chunk
    })
    req.on('end', () => {
      resolve(buf ? JSON.parse(buf) : undefined)
    })
  })
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
