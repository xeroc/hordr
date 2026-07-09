/* eslint-disable camelcase -- field names mirror the on-disk beans JSON contract */
/**
 * Thin synchronous wrapper around the `beans` CLI. Hordr reads beans for the
 * agent prompt, and — in the fleet model — the broker writes bean status as
 * part of rollup (ADR-0011: `beans update <ancestor> -s completed`). Outside
 * rollup, bean status is the human's/member's; hordr does not write it.
 */
import {execFileSync} from 'node:child_process'
import {z} from 'zod'

const BEAN_BIN = 'beans'

const RAW_BEAN_SCHEMA = z
  .object({
    body: z.string(),
    created_at: z.string(),
    etag: z.string(),
    id: z.string(),
    path: z.string(),
    priority: z.string(),
    slug: z.string(),
    status: z.unknown(),
    title: z.string(),
    type: z.string(),
    updated_at: z.string(),
  })
  .passthrough()

export interface BeanRecord {
  [key: string]: unknown
  body: string
  created_at: string
  etag: string
  id: string
  path: string
  priority: string
  slug: string
  title: string
  type: string
  updated_at: string
}

export class BeansError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BeansError'
  }
}

// --- test seams ---
export interface ShellOptions {
  cwd?: string
  encoding: 'utf8'
  stdio?: Array<'ignore' | 'pipe'>
}
export type ShellFn = (cmd: string, args: string[], opts: ShellOptions) => string

const defaultShell: ShellFn = (cmd, args, opts) =>
  execFileSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  }) as unknown as string

let _shell: ShellFn = defaultShell
let _beansPresent = true

export function _setShellForTesting(fn: ShellFn): void {
  _shell = fn
}

export function _resetShell(): void {
  _shell = defaultShell
}

export function _setBeansPresentForTesting(present: boolean): void {
  _beansPresent = present
}

function assertBeansOnPath(): void {
  if (!_beansPresent) throw new BeansError('beans CLI not found on PATH')
  try {
    execFileSync('sh', ['-c', 'command -v beans'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new BeansError('beans CLI not found on PATH')
  }
}

function runBeans(args: string[], beanId: string, cwd?: string): string {
  try {
    return _shell(BEAN_BIN, args, {cwd, encoding: 'utf8'})
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    const snippet = (e.stderr ?? e.message ?? '').slice(0, 200)
    throw new BeansError(`beans command failed for ${beanId}: ${BEAN_BIN} ${args.join(' ')}\n${snippet}`)
  }
}

/**
 * Read a bean by id. Throws BeansError on CLI failure or malformed JSON.
 * Pass `opts.cwd` to read from a different checkout (e.g. a worktree).
 */
export function getBean(beanId: string, opts?: {cwd?: string}): BeanRecord {
  assertBeansOnPath()
  const raw = runBeans(['show', '--json', beanId], beanId, opts?.cwd)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new BeansError(`beans show returned non-JSON for ${beanId}: ${(error as Error).message}`)
  }

  const loose = RAW_BEAN_SCHEMA.safeParse(data)
  if (!loose.success) {
    const issues = loose.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new BeansError(`beans show returned unexpected shape for ${beanId}: ${issues}`)
  }

  return loose.data
}

/** Convenience: just the body (used by the agent prompt). */
export function getBody(beanId: string): string {
  return getBean(beanId).body
}

/**
 * Mark a bean completed (broker rollup, ADR-0011). The one sanctioned bean-
 * status write from hordr; pass opts.cwd to write in a worktree checkout so
 * the rollup writes land with the member's work. Throws BeansError on failure.
 */
export function markBeanCompleted(beanId: string, opts?: {cwd?: string}): void {
  assertBeansOnPath()
  runBeans(['update', beanId, '-s', 'completed'], beanId, opts?.cwd)
}
