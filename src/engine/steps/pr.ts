import {execFileSync} from 'node:child_process'

import type {StepHandler} from './index.js'

import {DEFAULT_ROLE, launchOrReuse, StepError} from './shared.js'

// --- test seam (same pattern as beans/client.ts and close-merged.ts) ---
export type GhFn = (args: string[], cwd: string) => string

const defaultGh: GhFn = (args, cwd) =>
  execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string

let _gh: GhFn = defaultGh

export function _setGhForTesting(fn: GhFn): void {
  _gh = fn
}

export function _resetGh(): void {
  _gh = defaultGh
}

export const pr: StepHandler = (run, step, deps) => {
  if (!run.worktree) throw new StepError('pr: no worktree in run state')

  const {branch} = run.worktree
  const cwd = run.worktree.workspace_id

  // Idempotency: gh pr list returns [] (exit 0) when no PR exists for the
  // branch. Using --list avoids the non-zero exit that gh pr view produces.
  const out = _gh(['pr', 'list', '--head', branch, '--json', 'url', '--limit', '1'], cwd)
  const urls = JSON.parse(out) as unknown[]

  if (urls.length > 0) {
    return {done: true, runPatch: {status: 'pr-open'}}
  }

  // No PR yet → spawn open_pr agent to create one.
  const role = step.agent ?? DEFAULT_ROLE.pr!
  const {label, panes} = launchOrReuse(run, role, deps)

  deps.waitForAgentDone(label, 0)

  return {done: true, runPatch: {panes, status: 'pr-open'}}
}
