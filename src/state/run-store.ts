/* eslint-disable camelcase -- persists SPEC.md §3 snake_case JSON fields */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {type RunFilter, type RunState, RunStateSchema} from './schema.js'

// ponytail: cwd fallback for dev/testing; real deployments set HERDR_PLUGIN_STATE_DIR
const stateDir = (): string => process.env.HERDR_PLUGIN_STATE_DIR ?? path.join(process.cwd(), '.hordr-state')

export class StateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateError'
  }
}

function filePath(beanId: string): string {
  return path.join(stateDir(), `${beanId}.json`)
}

function parseRun(beanId: string, raw: string): RunState {
  let data: unknown

  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new StateError(`Run state corrupt for ${beanId}: ${(error as Error).message}`)
  }

  const result = RunStateSchema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new StateError(`Run state corrupt for ${beanId}: ${issues}`)
  }

  return result.data
}

export function getRun(beanId: string): null | RunState {
  const fp = filePath(beanId)
  if (!existsSync(fp)) return null
  return parseRun(beanId, readFileSync(fp, 'utf8'))
}

export function putRun(run: RunState): void {
  const parsed = RunStateSchema.parse(run)
  const now = Math.floor(Date.now() / 1000)
  const state: RunState = {
    ...parsed,
    started_unix: parsed.started_unix || now,
    updated_unix: now,
  }
  const dir = stateDir()

  mkdirSync(dir, {recursive: true})

  const finalPath = filePath(parsed.bean)
  const tmpPath = path.join(dir, `${parsed.bean}.json.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`)

  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(tmpPath, finalPath)
}

export function deleteRun(beanId: string): boolean {
  const fp = filePath(beanId)
  if (!existsSync(fp)) return false
  unlinkSync(fp)
  return true
}

export function listRuns(filter?: RunFilter): RunState[] {
  const dir = stateDir()
  if (!existsSync(dir)) return []

  const out: RunState[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const fp = path.join(dir, name)
    if (!statSync(fp).isFile()) continue
    const beanId = name.slice(0, -5)
    const run = parseRun(beanId, readFileSync(fp, 'utf8'))
    if (filter?.status && run.status !== filter.status) continue
    out.push(run)
  }

  return out
}
