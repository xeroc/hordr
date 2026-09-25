/**
 * VCS resolution: config.default_vcs → adapter instance (src/vcs/types.ts).
 *
 * One instance per kind, lazily created. `assertVcsReady` is the fail-fast
 * entry-point gate (fleet create / run / finish): jj mode needs a colocated
 * repo (`.jj` + git backing) and a jj binary on PATH. git mode is always
 * ready (the historical behavior — errors surface at first git call).
 */
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'

import type {HordrConfig} from '../config/schema.js'
import type {Vcs} from './types.js'

import {createGitVcs} from './git-vcs.js'
import {createJjVcs} from './jj-vcs.js'

export class VcsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VcsError'
  }
}

const cache = new Map<'git' | 'jj', Vcs>()

/** Resolve the configured adapter. Cached per kind. */
export function getVcs(config: Pick<HordrConfig, 'default_vcs'>): Vcs {
  const kind = config.default_vcs
  const hit = cache.get(kind)
  if (hit) return hit
  const vcs = kind === 'jj' ? createJjVcs() : createGitVcs()
  cache.set(kind, vcs)
  return vcs
}

// --- test seam ---
let _override: null | Vcs = null

export function _setVcsForTesting(vcs: null | Vcs): void {
  _override = vcs
}

/** Test-overridable resolution (mirrors runtime.ts getDeps pattern). */
export function getVcsOrMock(config: Pick<HordrConfig, 'default_vcs'>): Vcs {
  return _override ?? getVcs(config)
}

/** Walk up from `cwd` looking for a `.jj` directory (workspace or repo root). */
function findJjDir(cwd: string): string | undefined {
  let dir = path.resolve(cwd)
  for (;;) {
    if (existsSync(path.join(dir, '.jj'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Fail-fast validation for the configured VCS at command entry points.
 * Throws VcsError with actionable guidance when the mode can't work.
 */
export function assertVcsReady(config: Pick<HordrConfig, 'default_vcs'>, cwd: string): void {
  if (config.default_vcs !== 'jj') return

  try {
    execFileSync('jj', ['--version'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})
  } catch {
    throw new VcsError("default_vcs: jj requires the 'jj' binary on PATH — install jujutsu or set default_vcs: git")
  }

  const jjDir = findJjDir(cwd)
  if (!jjDir) {
    throw new VcsError(
      `default_vcs: jj requires a colocated jj repository (.jj not found above ${cwd}). ` +
        `Run 'jj git init --colocate' in the repo, or set default_vcs: git.`,
    )
  }
}

/**
 * The base every "wherever I stand" default resolves to: the working copy's
 * current ref. Throws VcsError with an actionable message when there isn't
 * one (detached HEAD / un-bookmarked ancestry) — callers surface --base.
 */
export function resolveBaseRef(vcs: Pick<Vcs, 'currentRef' | 'kind'>, cwd: string): string {
  const ref = vcs.currentRef(cwd)
  if (ref) return ref
  throw new VcsError(
    vcs.kind === 'jj'
      ? `no bookmark in the working copy's ancestry (${cwd}) — pass --base <bookmark>`
      : `no branch checked out at ${cwd} (detached HEAD or not a repo) — pass --base <branch>`,
  )
}
