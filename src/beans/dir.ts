/**
 * Resolve the beans data directory (default '.beans') from a worktree's
 * `.beans.yml` config. Used by rollup/commit paths and dirty-path filters
 * that need to scope git operations to the beans dir.
 *
 * Falls back to '.beans' when the config is missing, unreadable, or has no
 * `beans.path` key.
 */
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

export function resolveBeansDir(worktreePath: string): string {
  try {
    const cfgPath = path.join(worktreePath, '.beans.yml')
    if (existsSync(cfgPath)) {
      const raw = parse(readFileSync(cfgPath, 'utf8')) as {beans?: {path?: string}}
      if (raw?.beans?.path) return raw.beans.path
    }
  } catch {
    // Config unreadable — use default
  }

  return '.beans'
}
