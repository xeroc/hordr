/* eslint-disable camelcase -- field names mirror the on-disk beans JSON contract (see run-store.ts) */
/**
 * Thin synchronous wrapper around the `beans` CLI. Hordr is a CLI tool (not a
 * server), so blocking shell-outs are fine and keep call sites simple.
 *
 * hordr:workflow strategy — the `beans` CLI exposes NO frontmatter setter
 * (verified: `beans update --help` has no `--workflow` flag; `beans query
 * --schema` has no `workflow` field; the on-disk frontmatter only carries
 * title/status/type/priority/created_at/updated_at/order). SPEC §2 calls
 * workflow a "frontmatter field", but that is aspirational against the CLI we
 * actually have. We persist the workflow assignment as an HTML comment marker
 * in the bean BODY via `beans update --body-append` / `--body-replace-old`,
 * and read it back with one regex. hordr is the only reader/writer of this
 * marker, and we never edit `.beans/*.md` directly — `beans` stays the sole
 * authority on disk. Same outcome, no schema change.
 */
import {execFileSync} from 'node:child_process'
import {z} from 'zod'

const BEAN_BIN = 'beans'
const WORKFLOW_MARKER_RE = /<!-- hordr:workflow=(\S+) -->/

export type BeanStatus = 'completed' | 'draft' | 'in-progress' | 'scrapped' | 'todo'

const BEAN_STATUS_SCHEMA = z.enum(['todo', 'draft', 'in-progress', 'completed', 'scrapped'])

// Loosely typed shape from `beans show --json` (status narrowed separately for
// a targeted error message); passthrough tolerates new fields beans may add.
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
  status: BeanStatus
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

// --- test seams (module-level mutables; `_`-prefix marks non-public API) ---
export interface ShellOptions {
  encoding: 'utf8'
  stdio?: Array<'ignore' | 'pipe'>
}
export type ShellFn = (cmd: string, args: string[], opts: ShellOptions) => string

const defaultShell: ShellFn = (cmd, args, opts) =>
  execFileSync(cmd, args, {
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

/** Run `beans <args>`; any non-zero exit becomes a BeansError naming the bean + command + stderr. */
function runBeans(args: string[], beanId: string): string {
  try {
    return _shell(BEAN_BIN, args, {encoding: 'utf8'})
  } catch (error) {
    const e = error as {message?: string; stderr?: string}
    const snippet = (e.stderr ?? e.message ?? '').slice(0, 200)
    throw new BeansError(`beans command failed for ${beanId}: ${BEAN_BIN} ${args.join(' ')}\n${snippet}`)
  }
}

export function getBean(beanId: string): BeanRecord {
  assertBeansOnPath()
  const raw = runBeans(['show', '--json', beanId], beanId)
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

  const statusResult = BEAN_STATUS_SCHEMA.safeParse(loose.data.status)
  if (!statusResult.success) {
    throw new BeansError(`bean ${beanId} has invalid status: ${JSON.stringify(loose.data.status) ?? '<missing>'}`)
  }

  return {...loose.data, status: statusResult.data}
}

export function getStatus(beanId: string): BeanStatus {
  return getBean(beanId).status
}

export function getBody(beanId: string): string {
  return getBean(beanId).body
}

export function setStatus(beanId: string, status: BeanStatus): BeanStatus {
  // Validate input first; throws a ZodError before any shell call (AC #5).
  BEAN_STATUS_SCHEMA.parse(status)
  assertBeansOnPath()
  const raw = runBeans(['update', beanId, '--status', status, '--json'], beanId)

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new BeansError(`beans update returned non-JSON for ${beanId}: ${(error as Error).message}`)
  }

  const result = BEAN_STATUS_SCHEMA.safeParse((data as {status?: unknown}).status)
  if (!result.success) {
    throw new BeansError(
      `beans update returned invalid status for ${beanId}: ${JSON.stringify((data as {status?: unknown}).status)}`,
    )
  }

  return result.data
}

export function getWorkflow(beanId: string): null | string {
  const body = getBody(beanId)
  const m = WORKFLOW_MARKER_RE.exec(body)
  return m ? m[1] : null
}

export function setWorkflow(beanId: string, workflow: string): void {
  // Round-trip contract: marker regex is `(\S+)`, so reject empty/whitespace.
  if (!workflow || /\s/.test(workflow)) {
    throw new BeansError(`workflow must be non-empty and whitespace-free (bean ${beanId}): ${JSON.stringify(workflow)}`)
  }

  assertBeansOnPath()
  const marker = `<!-- hordr:workflow=${workflow} -->`
  const existing = getWorkflow(beanId)
  if (existing === null) {
    runBeans(['update', beanId, '--body-append', marker], beanId)
  } else {
    runBeans(
      ['update', beanId, '--body-replace-old', `<!-- hordr:workflow=${existing} -->`, '--body-replace-new', marker],
      beanId,
    )
  }
}
