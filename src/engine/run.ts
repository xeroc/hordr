/* eslint-disable camelcase -- updated_unix matches SPEC.md §3 on-disk JSON field */
import type {RunState, RunStatus} from '../state/schema.js'

export class TransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransitionError'
  }
}

// SPEC.md §3 transition table. Self-transitions are allowed (idempotent
// re-writes). running→closed is intentionally absent: closure must go
// through pr-open→closed (close-merged) or blocked→(reset, not modelled here).
export const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  'awaiting-approval': ['awaiting-approval', 'planning', 'queued'],
  blocked: ['blocked', 'running'],
  closed: ['closed'],
  planning: ['awaiting-approval', 'planning'],
  'pr-open': ['closed', 'pr-open'],
  queued: ['queued', 'running'],
  running: ['blocked', 'pr-open', 'running'],
}

// Pure state transition: returns a NEW RunState, does NOT persist.
// (none)→planning is handled at Run creation, not here. Callers persist
// the returned state via putRun.
export function transition(run: RunState, newState: RunStatus): RunState {
  if (!ALLOWED_TRANSITIONS[run.status].includes(newState)) {
    throw new TransitionError(
      `Invalid transition: ${run.status} -> ${newState} (allowed: ${ALLOWED_TRANSITIONS[run.status].join(', ')})`,
    )
  }

  return {...run, status: newState, updated_unix: Math.floor(Date.now() / 1000)}
}
