import {execFileSync} from 'node:child_process'

import type {EngineDeps} from './types.js'

import {setStatus} from '../beans/client.js'
import {listRuns, putRun} from '../state/run-store.js'
import {transition} from './run.js'

export class CloseMergedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CloseMergedError'
  }
}

// --- test seams (same pattern as beans/client.ts) ---
export interface GhOptions {
  cwd: string
  encoding: 'utf8'
}
export type GhFn = (args: string[], opts: GhOptions) => string

const defaultGh: GhFn = (args, opts) =>
  execFileSync('gh', args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string

let _gh: GhFn = defaultGh
let _ghPresent = true

export function _setGhForTesting(fn: GhFn): void {
  _gh = fn
}

export function _resetGh(): void {
  _gh = defaultGh
  _ghPresent = true
}

export function _setGhPresentForTesting(present: boolean): void {
  _ghPresent = present
}

function assertGhOnPath(): void {
  if (!_ghPresent) throw new CloseMergedError('gh CLI not found on PATH')
  try {
    execFileSync('sh', ['-c', 'command -v gh'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
  } catch {
    throw new CloseMergedError('gh CLI not found on PATH')
  }
}

interface PrInfo {
  mergedAt: null | string
  state: string
}

export interface CloseMergedResult {
  closed: string[]
  failed: string[]
  skipped: string[]
}

// Scan all pr-open runs; for each merged PR: mark bean completed, remove
// worktree, close the run. Returns categorized bean ids. Does not print —
// that's the CLI's job.
export function closeMerged(deps: EngineDeps): CloseMergedResult {
  const runs = listRuns({status: 'pr-open'})
  if (runs.length === 0) return {closed: [], failed: [], skipped: []}

  assertGhOnPath()

  const closed: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  for (const run of runs) {
    if (!run.worktree?.branch) {
      failed.push(run.bean)
      continue
    }

    let info: PrInfo
    try {
      const out = _gh(['pr', 'view', '--json', 'state,mergedAt', '--branch', run.worktree.branch], {
        cwd: run.worktree.workspace_id,
        encoding: 'utf8',
      })
      info = JSON.parse(out) as PrInfo
    } catch {
      // gh failure (auth, network, not found): record and continue.
      failed.push(run.bean)
      continue
    }

    if (info.state === 'MERGED') {
      setStatus(run.bean, 'completed')
      if (run.worktree) deps.removeWorktree(run.worktree.workspace_id)
      putRun(transition(run, 'closed'))
      closed.push(run.bean)
    } else {
      // OPEN, CLOSED, or other → not merged yet.
      skipped.push(run.bean)
    }
  }

  return {closed, failed, skipped}
}
