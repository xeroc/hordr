/**
 * jj adapter for the Vcs contract (src/vcs/types.ts). Colocated repos only.
 *
 * Model mapping:
 *   lane        = jj workspace (sibling dir of the main repo), head `<name>@`
 *   integration = the integration workspace's working-copy head (@) — never a
 *                 bookmark; bookmarks only move in mergeHeadIntoRef /
 *                 finalizeIntegration / deleteRef
 *   ref         = bookmark (colocation mirrors these to git branches)
 *
 * Two jj behaviors the engine relies on:
 *   - Snapshot semantics: every jj command snapshots the cwd's working copy
 *     into @ first, so integrateHead has NO clean-worktree guard — uncommitted
 *     edits ride along in the merge commit instead of being clobbered by a
 *     checkout (the git hazard the guard exists for).
 *   - Conflicts are first-class commit state, not an in-progress condition: a
 *     conflicted merge is simply left as the head for the merger agent;
 *     isIntegrationSettled reads that state back (no conflict AND >= 2
 *     parents — abandoning the merge collapses @ to one parent).
 */
import {execFileSync} from 'node:child_process'
import {rmSync} from 'node:fs'
import path from 'node:path'

import type {Vcs} from './types.js'

import {resolveBeansDir} from '../beans/dir.js'
import {closeWorkspace, createHerdrWorkspace} from '../herdr/worktree.js'

// --- test seams (module-level mutables; `_`-prefix marks non-public API) ---
export type JjShellFn = (args: string[], opts: {cwd: string}) => string

const defaultShell: JjShellFn = (args, opts) => {
  try {
    return execFileSync('jj', ['--no-pager', '--color=never', ...args], {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as unknown as string
  } catch (error) {
    // Wrap non-zero exits so callers get one error type with the stderr snippet.
    const err = error as {message?: string; stderr?: {toString(): string}}
    const stderr = err.stderr?.toString() ?? ''
    throw new Error(
      `jj ${args.join(' ')} failed: ${err.message ?? ''}${stderr ? ` (stderr: ${stderr.slice(0, 200)})` : ''}`,
    )
  }
}

let _shell: JjShellFn = defaultShell

export function _setShellForTesting(fn: JjShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

/**
 * Run jj in `cwd`. In multi-workspace repos a workspace's working copy goes
 * stale whenever ANY other workspace advanced the repo (lane agents run
 * concurrently) — jj refuses commands there until `jj workspace update-stale`
 * recovers it (itself a safe no-op when fresh). Retry exactly once.
 */
function run(args: string[], cwd: string): string {
  try {
    return _shell(args, {cwd})
  } catch (error) {
    const e = error as {message?: string; stderr?: {toString(): string}}
    if (!/working copy is stale/i.test(`${e.message ?? ''} ${e.stderr?.toString() ?? ''}`)) throw error
    _shell(['workspace', 'update-stale'], {cwd})
    return _shell(args, {cwd})
  }
}

const CONFLICT_PROBE = 'if(conflict, "1", "")'
const HEAD_PROBE = 'if(empty, "E", "NE") ++ "|" ++ description'

function isConflicted(cwd: string): boolean {
  return run(['log', '-r', '@', '--no-graph', '-T', CONFLICT_PROBE], cwd).trim() === '1'
}

/** Parent count of @ — one `commit_id` line per parent (>= 2 = merge). */
function parentCount(cwd: string): number {
  return run(['log', '-r', '@-', '--no-graph', '-T', String.raw`commit_id ++ "\n"`], cwd)
    .split('\n')
    .filter((line) => line.trim() !== '').length
}

/**
 * Parse `jj workspace list` into name → absolute path. Lines look like
 * `default: . abc123 4c4c4c (empty)` / `laneA: ../laneA xyz ...`; the path may
 * be relative to the cwd the command ran from.
 */
function listWorkspaces(cwd: string): Map<string, string> {
  const workspaces = new Map<string, string>()
  for (const line of run(['workspace', 'list'], cwd).split('\n')) {
    const match = /^([^\s:]+):\s+(\S+)/.exec(line)
    if (match) workspaces.set(match[1], path.resolve(cwd, match[2]))
  }

  return workspaces
}

export interface JjVcsDeps {
  /**
   * herdr workspace adoption for created jj workspaces. Injectable so tests
   * (and jj-only environments without a live herdr) never shell out to herdr.
   */
  herdrCreate?: (opts: {cwd: string; label: string}) => {workspaceId: string}
}

export function createJjVcs(deps: JjVcsDeps = {}): Vcs {
  const herdrCreate = deps.herdrCreate ?? createHerdrWorkspace
  return {
    commitPending(opts) {
      const [marker, ...description] = run(['log', '-r', '@', '--no-graph', '-T', HEAD_PROBE], opts.cwd)
        .trim()
        .split('|')
      if (marker !== 'NE') return false // empty @: the resting state, nothing pending
      if (description.join('|').trim() !== '') return false // already described — never clobber
      run(['commit', '-m', opts.message], opts.cwd)
      return true
    },

    conflictedFiles(cwd) {
      try {
        return run(['resolve', '--list'], cwd)
          .split('\n')
          .map((line) => line.trim().split(/\s+/)[0])
          .filter((p) => p !== '')
      } catch {
        return [] // "No conflicts found" (non-zero) or probe failure
      }
    },

    createWorkspace(opts) {
      const workspaces = listWorkspaces(opts.cwd)
      const existing = workspaces.get(opts.name)
      if (existing) {
        // Reuse-if-exists: re-running lane creation must not fail.
        return {path: existing, workspaceId: herdrCreate({cwd: existing, label: opts.name}).workspaceId}
      }

      const dest = path.join(path.dirname(path.resolve(opts.cwd)), opts.name)
      // `base` names another workspace's head when one exists, else it is a
      // bookmark/revset verbatim.
      const revset = workspaces.has(opts.base) ? `${opts.base}@` : opts.base
      run(['workspace', 'add', dest, '--name', opts.name, '-r', revset], opts.cwd)
      return {path: dest, workspaceId: herdrCreate({cwd: dest, label: opts.name}).workspaceId}
    },

    deleteRef(opts) {
      // jj exits 0 ("No bookmarks to delete") on absent names — natively
      // tolerant. `force` is git's `-D` concern; jj bookmarks carry no
      // merged-state guard, so one delete path covers both.
      run(['bookmark', 'delete', opts.name], opts.cwd)
    },

    dirtyPaths(cwd) {
      try {
        // Snapshots the working copy first, so in-flight edits are included.
        return run(['diff', '--summary'], cwd)
          .split('\n')
          .map((line) => line.trim().slice(2).trim())
          .filter((p) => p !== '')
      } catch {
        // Probes must fail loud: done gates treat this sentinel as dirty.
        return ['<vcs probe failed>']
      }
    },

    finalizeIntegration(opts) {
      if (opts.target) run(['bookmark', 'set', opts.target, '-r', '@'], opts.cwd)
      run(['new'], opts.cwd)
    },

    findWorkspace(opts) {
      const existing = listWorkspaces(opts.cwd).get(opts.name)
      // jj carries no herdr bookkeeping, so there is no workspaceId to report.
      return existing ? {path: existing} : null
    },

    hasNewCommits(opts) {
      try {
        // Commits the cwd stack lacks from source, IGNORING undescribed
        // empty parked heads — parking one on ms (finalizeIntegration does)
        // must not re-arm an empty refresh merge.
        return (
          run(
            ['log', '-r', `(::${opts.source}@ & ~(empty() & description(exact:""))) ~ ::@`, '--no-graph', '-T', 'commit_id'],
            opts.cwd,
          ).trim() !== ''
        )
      } catch {
        return true // unreadable state: fail open, let the merge surface it
      }
    },

    integrateHead(opts) {
      // No clean-worktree guard: jj snapshot semantics carry uncommitted edits
      // into the merge instead of losing them under a checkout.
      try {
        run(['new', '@', `${opts.source}@`, '-m', opts.message], opts.cwd)
        if (isConflicted(opts.cwd)) return {status: 'conflict'} // leave the conflicted merge as head
        run(['new'], opts.cwd) // park an undescribed empty head for the next lane
        return {status: 'merged'}
      } catch (error) {
        return {message: (error as Error).message, status: 'aborted'}
      }
    },

    isCleanIgnoringBeans(cwd) {
      // FAIL-OPEN on probe failure: matches the git adapter's merge-guard
      // policy — a broken workspace must not stall the lane.
      try {
        return run(['diff', '--summary'], cwd)
          .split('\n')
          .map((line) => line.trim().slice(2).trim())
          .filter((p) => p !== '' && !p.startsWith(`${beansDirOf(cwd)}/`)).length === 0
      } catch {
        return true
      }
    },

    isIntegrationSettled(opts) {
      // source/target are git-workflow concepts — the jj integration line is
      // the workspace head itself. Settled = every conflict resolved AND the
      // two-parent merge still standing (an abandoned merge collapses @ to a
      // single parent → keep waiting).
      try {
        return !isConflicted(opts.cwd) && parentCount(opts.cwd) >= 2
      } catch {
        return false // unreadable state is not settled
      }
    },

    kind: 'jj',

    mergeHeadIntoRef(opts) {
      try {
        run(['new', opts.ref, '@', '-m', opts.message], opts.cwd)
        if (isConflicted(opts.cwd)) return {status: 'conflict'} // bookmark stays unmoved
        run(['bookmark', 'set', opts.ref, '-r', '@'], opts.cwd)
        run(['new'], opts.cwd)
        return {status: 'merged'}
      } catch (error) {
        return {message: (error as Error).message, status: 'aborted'}
      }
    },

    projectKey(cwd) {
      try {
        return run(['git', 'root'], cwd).trim()
      } catch (error) {
        throw new Error(
          `projectKey: ${cwd} is not inside a colocated jj repository (${(error as Error).message})`,
        )
      }
    },

    removeWorkspace(opts) {
      // jj exits 0 with a warning on unknown names — but stay tolerant of any
      // error: a re-run after teardown must not fail.
      try {
        run(['workspace', 'forget', opts.name], opts.cwd)
      } catch {
        // Already unregistered
      }

      try {
        rmSync(opts.path, {force: true, recursive: true})
      } catch {
        // Best-effort: force already tolerates a missing dir
      }

      // closeWorkspace itself tolerates an already-gone workspace.
      if (opts.workspaceId) closeWorkspace(opts.workspaceId)
    },
  }
}

/** Beans data dir name for a working copy (from its .beans.yml, else '.beans'). */
function beansDirOf(cwd: string): string {
  return resolveBeansDir(cwd)
}
