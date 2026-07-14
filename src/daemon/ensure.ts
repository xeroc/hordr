/**
 * Daemon reachability check (ADR-0012, revised: no auto-spawn).
 *
 * `fleet create` requires the daemon to already be listening. A cheap
 * GET /health over the unix socket tells us if it's alive; if not, throw —
 * the operator starts the daemon explicitly with `hordr daemon`.
 */
import http from 'node:http'

import {FleetError} from '../fleet/lifecycle.js'
import {socketPath} from './socket.js'

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
 * Require the daemon to be listening on `sockPath`. If /health answers,
 * return. Otherwise throw FleetError instructing the operator to start it.
 *
 * Never spawns. Re-exported as a seam so tests inject a stub.
 */
export async function requireDaemonRunning(opts?: {socket?: string}): Promise<void> {
  const sock = opts?.socket ?? socketPath()
  if (await pingHealth(sock)) return
  throw new FleetError(`hordr daemon is not running on ${sock}. Start it in another terminal with: hordr daemon`)
}

// --- test seam ---
let _override: ((opts?: {socket?: string}) => Promise<void>) | null = null

export function _setEnsureDaemonForTesting(fn: ((opts?: {socket?: string}) => Promise<void>) | null): void {
  _override = fn
}

export function ensureDaemon(opts?: {socket?: string}): Promise<void> {
  return _override ? _override(opts) : requireDaemonRunning(opts)
}
