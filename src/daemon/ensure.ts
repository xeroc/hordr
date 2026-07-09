/**
 * Lazy daemon auto-start (ADR-0012).
 *
 * `fleet create` ensures the daemon is running so per-lane dispatch loops can
 * tick. A cheap GET /health over the unix socket tells us if it's alive; if
 * not, spawn `hordr daemon` detached (unref'd so the CLI returns immediately).
 */
import {spawn} from 'node:child_process'
import http from 'node:http'

import {socketPath} from './socket.js'

export interface EnsureDaemonResult {
  started: boolean
}

/** Resolve a daemon /health check as a boolean (true = alive). */
function pingHealth(sockPath: string, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({method: 'GET', path: '/health', socketPath: sockPath, timeout: timeoutMs}, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

/**
 * Ensure the daemon is listening on `sockPath`. If /health answers, do
 * nothing. Otherwise spawn `hordr daemon` detached and unref'd.
 *
 * Returns {started: true} if this call spawned the daemon, false if it was
 * already alive. Re-exported as a seam so tests inject a stub.
 */
export async function ensureDaemonRunning(opts?: {socket?: string}): Promise<EnsureDaemonResult> {
  const sock = opts?.socket ?? socketPath()
  if (await pingHealth(sock)) return {started: false}

  const child = spawn('hordr', ['daemon'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return {started: true}
}

// --- test seam ---
let _override: ((opts?: {socket?: string}) => Promise<EnsureDaemonResult>) | null = null

export function _setEnsureDaemonForTesting(
  fn: ((opts?: {socket?: string}) => Promise<EnsureDaemonResult>) | null,
): void {
  _override = fn
}

export function ensureDaemon(opts?: {socket?: string}): Promise<EnsureDaemonResult> {
  return _override ? _override(opts) : ensureDaemonRunning(opts)
}
