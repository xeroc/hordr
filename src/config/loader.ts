import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

import {applyAgentOverrides, getCompanyContext} from '../company.js'
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
  // Agent Companies: when HORDR_COMPANY + HORDR_PROJECT are set, resolve the
  // project working directory from PROJECT.md frontmatter and chdir there
  // before searching for .beans.yml. Lazy + memoized — no-op without env vars.
  const companyCtx = getCompanyContext()

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

  // Agent Companies: override agent personas from AGENTS.md bodies + inline skills.
  const result = companyCtx ? applyAgentOverrides(parsed.data, companyCtx) : parsed.data

  // Runtime validation: every agent needs a persona by now (from .beans.yml or AGENTS.md).
  for (const [role, agent] of Object.entries(result.agents)) {
    if (!agent.persona) {
      throw new ConfigError(
        `Agent '${role}' has no persona. Set one in .beans.yml or provide agents/${role}/AGENTS.md in the company package.`,
        configPath,
      )
    }
  }

  return result
}
