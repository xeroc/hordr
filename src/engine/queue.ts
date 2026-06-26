import {spawn} from 'node:child_process'
import process from 'node:process'

import type {EngineDeps} from './types.js'

import {loadConfig} from '../config/loader.js'
import {getRun, listRuns, putRun} from '../state/run-store.js'
import {transition} from './run.js'

// Count of runs occupying concurrency slots (running or blocked).
export function activeCount(): number {
  return listRuns().filter((r) => r.status === 'blocked' || r.status === 'running').length
}

// Max concurrent active runs. Reloads config every call (cheap; avoids stale
// cache). Trusts the config schema's z.number().int().positive() validation.
export function capacity(): number {
  return loadConfig().concurrency
}

// ponytail: fire-and-forget supervisor spawn via detached child. hordr-1006
// wires the real herdr pane; tests inject a recording stub.
//
// Honors HERDR_BIN_PATH so test harnesses can redirect to /bin/true.
// Spawn errors (binary missing, permission denied) are swallowed — this is
// fire-and-forget; the supervisor pane is a UX nicety, not a correctness
// requirement. If it fails to start, the run is still in 'running' state
// and `hordr advance <bean>` will drive it manually.
const HORDR_BIN = process.env.HERDR_BIN_PATH ?? 'hordr'

export function defaultSpawnSupervisor(beanId: string): void {
  const child = spawn(HORDR_BIN, ['supervise', beanId], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('error', () => {
    // Swallow — see comment above.
  })
  child.unref()
}

// Enqueue a bean: start immediately if a slot is free, otherwise leave it
// queued. Returns the effective status.
export function enqueue(
  beanId: string,
  _deps: EngineDeps,
  spawn: (id: string) => void = defaultSpawnSupervisor,
): 'queued' | 'running' {
  // _deps reserved for future dep injection (e.g. herdr pane creation).

  if (activeCount() < capacity()) {
    const run = getRun(beanId)
    if (!run) throw new Error(`enqueue: no run for bean ${beanId}`)
    putRun(transition(run, 'running'))
    spawn(beanId)
    return 'running'
  }

  return 'queued'
}

// Drain the queue: start queued runs (oldest first) until at capacity.
// Returns bean ids that were started.
export function drain(deps: EngineDeps, spawn: (id: string) => void = defaultSpawnSupervisor): string[] {
  const started: string[] = []

  while (activeCount() < capacity()) {
    const queued = listRuns({status: 'queued'}).sort((a, b) => a.started_unix - b.started_unix)
    if (queued.length === 0) break

    const next = queued[0]
    putRun(transition(next, 'running'))
    spawn(next.bean)
    started.push(next.bean)
  }

  return started
}
