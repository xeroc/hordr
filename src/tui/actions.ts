import {spawnSync} from 'node:child_process'

/**
 * Pure mapping from a TUI fleet action to the `hordr fleet ...` argv that the
 * TUI shells out to. Routing actions through the existing CLI command path
 * means zero logic duplication — every finish/abort/reset runs the same tested
 * guards, merge strategy, and teardown as `hordr fleet <cmd>`. No OpenTUI
 * imports, so this is mocha/node testable.
 */

/** A per-fleet action exposed in the TUI's action menu. */
export type FleetAction = 'abort' | 'finish' | 'reset' | 'status'

/**
 * Build the argv (everything after the `hordr` binary) for a fleet action.
 * `abort` accepts `force` to also discard work (--force), mirroring the CLI.
 */
export function fleetActionArgs(
  action: FleetAction,
  milestone: string,
  opts: {force?: boolean} = {},
): string[] {
  switch (action) {
    case 'abort': {
      return opts.force ? ['fleet', 'abort', milestone, '--force'] : ['fleet', 'abort', milestone]
    }

    case 'finish': {
      return ['fleet', 'finish', milestone]
    }

    case 'reset': {
      return ['fleet', 'reset', milestone]
    }

    case 'status': {
      return ['fleet', 'status', milestone]
    }
  }

  // Exhaustiveness guard: adding a FleetAction without a case fails to compile.
  const exhaustive: never = action
  throw new Error(`unhandled fleet action: ${exhaustive}`)
}

/** The global broker pass — pressing `c` in the TUI runs one `hordr fleet check`. */
export function globalCheckArgs(): string[] {
  return ['fleet', 'check']
}

export interface ActionResult {
  ok: boolean
  stderr: string
  stdout: string
}

/**
 * Run a `hordr` subcommand synchronously and capture its result. Thin I/O —
 * the argv come from the pure {@link fleetActionArgs}/{@link globalCheckArgs}
 * mappings, so the logic stays tested without spawning. The binary is
 * injectable (default `hordr`) so callers can point at a dev build.
 */
export function runHordr(bin: string, args: string[]): ActionResult {
  const result = spawnSync(bin, args, {encoding: 'utf8'})
  return {
    ok: result.status === 0,
    stderr: (result.stderr ?? '').trim(),
    stdout: (result.stdout ?? '').trim(),
  }
}
