import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

import {type HordrConfig, HordrConfigSchema} from './schema.js'

export class ConfigError extends Error {
  configPath?: string

  constructor(message: string, configPath?: string) {
    super(message)
    this.name = 'ConfigError'
    this.configPath = configPath
  }
}

// ponytail: simple upward search to /, first .beans.yml wins
function findConfigPath(start: string): string | undefined {
  let dir = start
  while (true) {
    const candidate = path.join(dir, '.beans.yml')
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function loadConfig(pathArg?: string): HordrConfig {
  const configPath = pathArg ?? findConfigPath(process.cwd())
  if (!configPath) throw new ConfigError('No hordr config found')

  let raw: unknown
  try {
    raw = parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new ConfigError(`Failed to parse config: ${(error as Error).message}`, configPath)
  }

  const doc = (raw ?? {}) as Record<string, unknown>
  if (!('hordr' in doc)) throw new ConfigError('No hordr config found', configPath)

  const parsed = HordrConfigSchema.safeParse(doc.hordr)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ConfigError(`Invalid hordr config:\n  ${lines.join('\n  ')}`, configPath)
  }

  return parsed.data
}
