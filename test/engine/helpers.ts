/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import type {EngineDeps} from '../../src/engine/types.js'
import type {RunState} from '../../src/state/schema.js'

export function makeRun(overrides: Partial<RunState> = {}): RunState {
  const now = Math.floor(Date.now() / 1000)
  return {
    bean: 'hordr-test',
    panes: {},
    started_unix: now,
    status: 'running',
    step: 0,
    updated_unix: now,
    workflow: 'implement',
    worktree: null,
    ...overrides,
  }
}

// Minimal mock EngineDeps. Each function returns a canned value; callers pass
// overrides to customise behaviour (e.g. detectTestSignal → 'red').
export function makeDeps(overrides: Partial<EngineDeps> = {}): EngineDeps {
  return {
    createWorktree: (beanId) => ({branch: `bean/${beanId}`, workspaceId: `/tmp/wt-${beanId}`}),
    detectTestSignal: () => 'green',
    launchAgent: (opts) => ({paneLabel: `hordr:${opts.beanId}:${opts.role}`}),
    paneExists: () => false,
    readAgentOutput: () => '',
    removeWorktree() {},
    waitForAgentDone() {},
    ...overrides,
  }
}
