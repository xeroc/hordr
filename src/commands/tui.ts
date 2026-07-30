import {Command} from '@oclif/core'
import {spawnSync} from 'node:child_process'

/**
 * Decide whether `hordr tui` can run in the current process. Pure — callers
 * pass the detected environment so this is mocha-testable without mutating
 * `process`.
 *
 * Why each branch:
 *  - `bun-blocked`: OpenTUI would run under Bun, but hordr's storage layer is
 *    better-sqlite3, a Node N-API addon Bun cannot load. Bun is not viable.
 *  - `node-too-old`: OpenTUI's native (Zig) renderer needs Node's experimental
 *    FFI, available from 26.4 onward.
 *  - `needs-ffi-flag`: Node is new enough but wasn't launched with
 *    --experimental-ffi, so the native renderer can't load.
 *  - `proceed`: hand off to the OpenTUI boot.
 */
export type RuntimeDecision = 'bun-blocked' | 'needs-ffi-flag' | 'node-too-old' | 'proceed'

export function decideRuntime(opts: {
  bun: boolean
  ffiFlag: boolean
  major: number
  minor: number
}): RuntimeDecision {
  if (opts.bun) return 'bun-blocked'
  if (opts.major < 26 || (opts.major === 26 && opts.minor < 4)) return 'node-too-old'
  if (!opts.ffiFlag) return 'needs-ffi-flag'
  return 'proceed'
}

/** True if the process was launched with --experimental-ffi. */
export const ffiEnabled = (): boolean => process.execArgv.some((arg) => arg.includes('experimental-ffi'))

/**
 * `hordr tui` — interactive fleet manager.
 *
 * Lists every fleet across projects and exposes the same actions as
 * `hordr fleet` (status / reset / finish / abort), plus a `c` key that runs
 * one broker pass (`hordr fleet check`). Observer-only: it never advances
 * fleets itself.
 *
 * OpenTUI's native renderer needs Node 26.4+ with --experimental-ffi (Bun can't
 * load hordr's better-sqlite3). Launch it as:
 *
 *   node --experimental-ffi $(which hordr) tui
 *
 * The renderer is imported lazily so a plain node invocation of any other
 * command never loads native code.
 */
export default class Tui extends Command {
  static description = 'Interactive fleet-management TUI (Node 26.4+ with --experimental-ffi).'
  static examples = ['node --experimental-ffi <%= config.bin %> tui']

  async run(): Promise<void> {
    const [majorStr, minorStr] = process.versions.node.split('.')
    const decision = decideRuntime({
      bun: Boolean(process.versions.bun),
      ffiFlag: ffiEnabled(),
      major: Number(majorStr),
      minor: Number(minorStr),
    })

    switch (decision) {
      case 'bun-blocked': {
        this.error(
          "hordr tui can't run under Bun: hordr uses better-sqlite3, which Bun doesn't support. " +
            'Use Node 26.4+ with --experimental-ffi: node --experimental-ffi $(which hordr) tui',
        )
        break
      }

      case 'needs-ffi-flag': {
        // Self re-exec with --experimental-ffi so `hordr tui` just works on
        // Node 26.4+. The re-spawn re-enters this command with the flag set,
        // hitting the 'proceed' branch. process.argv[1] is the `hordr` bin
        // (a node script), so node can run it directly.
        const result = spawnSync(process.execPath, ['--experimental-ffi', ...process.argv.slice(1)], {
          stdio: 'inherit',
        })
        if (result.error) {
          this.error(
            `Failed to re-launch under --experimental-ffi: ${(result.error as Error).message}. ` +
              'Run manually: node --experimental-ffi $(which hordr) tui',
          )
        }

        this.exit(result.status ?? 1)
        break
      }

      case 'node-too-old': {
        this.error(
          `hordr tui needs Node 26.4+ for OpenTUI's native renderer (you are on v${process.versions.node}). ` +
            'Upgrade Node, then: node --experimental-ffi $(which hordr) tui',
        )
        break
      }

      default: {
        // Dynamic import: boot.ts pulls in @opentui/core's native Zig renderer.
        // Importing it statically would crash `hordr --help`, oclif manifest
        // generation, and the mocha suite. Only load it once the runtime guard
        // above has confirmed a FFI-capable Node.
        const {bootTui} = await import('../tui/boot.js')
        await bootTui()
      }
    }
  }
}
