/**
 * Fleet-check mutual-exclusion lock (ADR-0015).
 *
 * `hordr fleet check` is stateless and cron-able, so two runs can overlap
 * (cron + manual). A PID-file lock serializes them: O_EXCL create, and on
 * collision check whether the holder PID is alive — a crashed/killed prior
 * run leaves a stale lockfile that the next check steals.
 *
 * Single-machine only (hordr is tmux-local). ponytail: ceiling — if the stale
 * PID is recycled to a long-lived unrelated process, the lock waits until that
 * process exits; recover by deleting the lockfile. Negligible on a dev box.
 */
import {closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Default lock path: $HOME/.hordr/fleet.lock (HORDR_LOCK override). */
export function defaultLockPath(): string {
  return process.env.HORDR_LOCK ?? path.join(os.homedir(), '.hordr', 'fleet.lock')
}

/** True if a process owns `pid` (signal 0 probe). */
function pidAlive(pid: number): boolean {
  try {
    // ponytail: process.kill(0) is the standard liveness probe; ESRCH/EINVAL → dead.
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export interface AcquireLockOpts {
  /** Lockfile path (default: {@link defaultLockPath}). */
  path?: string
  /** PID to record (default: current process). Test seam. */
  pid?: number
}

/**
 * Acquire the fleet-check lock. Returns a release function, or null if held by
 * a live process. Steals stale locks (dead holder). Release is idempotent and
 * also fires on process exit (best-effort).
 */
export function acquireFleetLock(opts?: AcquireLockOpts): (() => void) | null {
  const lockPath = opts?.path ?? defaultLockPath()
  const pid = opts?.pid ?? process.pid

  if (tryCreate(lockPath, pid)) return makeRelease(lockPath)

  // Collision: is the holder alive? Stale → steal + retry once.
  const holder = readHolderPid(lockPath)
  if (holder !== null && pidAlive(holder)) return null

  try {
    unlinkSync(lockPath)
  } catch {
    /* best-effort */
  }

  return tryCreate(lockPath, pid) ? makeRelease(lockPath) : null
}

/** O_EXCL create the lockfile and write the PID. True on success. */
function tryCreate(lockPath: string, pid: number): boolean {
  try {
    mkdirSync(path.dirname(lockPath), {recursive: true})
  } catch {
    /* ignore — the open() below surfaces the real error */
  }

  try {
    // 'wx' = O_EXCL create: fails if the file already exists.
    const fd = openSync(lockPath, 'wx')
    writeSync(fd, String(pid))
    closeSync(fd)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return false
  }
}

/** Read the holder PID from the lockfile, or null if unreadable/non-numeric. */
function readHolderPid(lockPath: string): null | number {
  try {
    const n = Number(readFileSync(lockPath, 'utf8').trim())
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Build an idempotent release that also self-installs on process exit. */
function makeRelease(lockPath: string): () => void {
  let released = false
  const release = () => {
    if (released) return
    released = true
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    } catch {
      /* best-effort */
    }
  }

  // ponytail: exit-hook covers clean exits; crashes fall to the stale-PID steal.
  process.once('exit', release)
  return release
}
