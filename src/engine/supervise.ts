import {execFileSync} from 'node:child_process'

import type {StepHandler} from './steps/index.js'
import type {EngineDeps} from './types.js'

import {advance} from './advance.js'

// Blocking loop: advance until the run reaches a terminal or blocked state.
// Designed to run inside a herdr supervisor pane.
//
// ponytail: sleep via shell — 1s granularity is fine for v1. handlers is a
// test seam matching advance's signature.
export function supervise(
  beanId: string,
  deps: EngineDeps,
  pollMs = 1000,
  handlers?: Record<string, StepHandler>,
): void {
  const sleepSecs = Math.max(0, Math.floor(pollMs / 1000))

  while (true) {
    const r = advance(beanId, deps, handlers)

    if (r.terminal || r.block) return

    if (sleepSecs > 0) {
      execFileSync('sleep', [String(sleepSecs)], {stdio: 'ignore'})
    }
  }
}
