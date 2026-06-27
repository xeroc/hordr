import {execFileSync} from 'node:child_process'

import type {EngineDeps} from './types.js'

import {advance} from './advance.js'

// Blocking loop: advance until the run reaches a terminal or blocked state.
export function supervise(beanId: string, deps: EngineDeps, pollMs = 1000): void {
  const sleepSecs = Math.max(0, Math.floor(pollMs / 1000))

  while (true) {
    const r = advance(beanId, deps)
    if (r.terminal || r.block) return

    if (sleepSecs > 0) {
      execFileSync('sleep', [String(sleepSecs)], {stdio: 'ignore'})
    }
  }
}
