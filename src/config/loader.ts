import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'yaml'

import {applyAgentOverrides, getCompanyContext} from '../company.js'
import {DEFAULT_AGENTS} from './defaults.js'
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
  // Phase 1: env-var company context (vault entry — may chdir before .beans.yml search)
  getCompanyContext()

  const configPath = pathArg ?? findConfigPath(process.cwd())
  if (!configPath) throw new ConfigError('No hordr config found')

  let raw: unknown
  try {
    raw = parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new ConfigError(`Failed to parse config: ${(error as Error).message}`, configPath)
  }

  const doc = (raw ?? {}) as Record<string, unknown>
  // Missing hordr: block is fine — defaults cover it.
  const hordrBlock = ('hordr' in doc ? doc.hordr : {}) as Record<string, unknown>

  const parsed = HordrConfigSchema.safeParse(hordrBlock)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ConfigError(`Invalid hordr config:\n  ${lines.join('\n  ')}`, configPath)
  }

  // Phase 2: company path — env var HORDR_COMPANY_PATH overrides config, then config's company.path
  const companyPath = process.env.HORDR_COMPANY_PATH ?? parsed.data.company?.path
  const companyCtx = getCompanyContext(companyPath)

  // Agent Companies: populate agents from AGENTS.md bodies + inline skills.
  const result = companyCtx ? applyAgentOverrides(parsed.data, companyCtx) : parsed.data

  // Merge default agents (user-configured agents take precedence).
  for (const [role, def] of Object.entries(DEFAULT_AGENTS)) {
    if (!(role in result.agents)) result.agents[role] = def
  }

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
