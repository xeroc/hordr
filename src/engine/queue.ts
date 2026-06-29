import type {EngineDeps} from './types.js'

import {loadConfig} from '../config/loader.js'
import {listRuns, putRun} from '../state/run-store.js'
import {transition} from './run.js'
import {advance} from './advance.js'

/** Count of runs occupying concurrency slots (running or blocked). */
export function activeCount(): number {
  return listRuns().filter((r) => r.status === 'blocked' || r.status === 'running').length
}

/** Max concurrent active runs. */
export function capacity(): number {
  return loadConfig().concurrency
}

/**
 * Enqueue a bean: if a slot is free, transition to running + spawn first agent.
 * Otherwise leave it queued. Returns the effective status.
 */
export function enqueue(beanId: string, deps: EngineDeps): 'queued' | 'running' {
  if (activeCount() < capacity()) {
    const run = listRuns().find((r) => r.bean === beanId)
    if (!run) throw new Error(`enqueue: no run for bean ${beanId}`)
    putRun(transition(run, 'running'))
    advance(beanId, deps)
    return 'running'
  }

  return 'queued'
}

/**
 * Drain the queue: start queued runs (oldest first) until at capacity.
 * Each started run gets advance'd (spawns its first agent).
 * Returns bean ids that were started.
 */
export function drain(deps: EngineDeps): string[] {
  const started: string[] = []

  while (activeCount() < capacity()) {
    const queued = listRuns({status: 'queued'}).sort((a, b) => a.started_unix - b.started_unix)
    if (queued.length === 0) break

    const next = queued[0]!
    putRun(transition(next, 'running'))
    advance(next.bean, deps)
    started.push(next.bean)
  }

  return started
}
