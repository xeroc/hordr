/**
 * Agent Companies package support.
 *
 * Loads Agent Companies markdown manifests (AGENTS/PROJECT/SKILL/COMPANY.md)
 * and resolves a company context from HORDR_COMPANY + HORDR_PROJECT env vars.
 * When active, agent personas are overridden from AGENTS.md bodies with
 * inlined SKILL.md content, and the process chdir's to the project's
 * working directory so beans/herdr/git operate in the right repo.
 *
 * Spec: https://agentcompanies.io/specification.md
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {parse} from 'yaml'

import type {HordrConfig} from './config/schema.js'

// --- errors ---

export class CompanyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyError'
  }
}

// --- frontmatter parsing ---

/** Match opening `---\n`, capture frontmatter, close on `\n---`, rest is body. */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

export function parseFrontmatter(content: string): {body: string; frontmatter: Record<string, unknown>} {
  const match = content.match(FRONTMATTER_RE)
  if (!match) return {body: content, frontmatter: {}}
  const frontmatter = (parse(match[1]) ?? {}) as Record<string, unknown>
  return {body: match[2], frontmatter}
}

// --- manifest types ---

export interface AgentManifest {
  body: string
  harness?: string
  name?: string
  reportsTo?: null | string
  skills?: string[]
  slug?: string
}

export interface ProjectManifest {
  body: string
  name?: string
  path: string
  slug?: string
}

export interface SkillManifest {
  body: string
  name?: string
  slug?: string
}

// --- manifest parsers ---

export function parseAgentManifest(raw: string): AgentManifest {
  const {body, frontmatter} = parseFrontmatter(raw)
  return {
    body,
    harness: frontmatter.harness as string | undefined,
    name: frontmatter.name as string | undefined,
    reportsTo: frontmatter.reportsTo as null | string | undefined,
    skills: frontmatter.skills as string[] | undefined,
    slug: frontmatter.slug as string | undefined,
  }
}

export function parseProjectManifest(raw: string): ProjectManifest {
  const {body, frontmatter} = parseFrontmatter(raw)
  const p = frontmatter.path as string | undefined
  if (!p) throw new CompanyError(`PROJECT.md missing required 'path' field in frontmatter`)
  return {
    body,
    name: frontmatter.name as string | undefined,
    path: p,
    slug: frontmatter.slug as string | undefined,
  }
}

export function parseSkillManifest(raw: string): SkillManifest {
  const {body, frontmatter} = parseFrontmatter(raw)
  return {
    body,
    name: frontmatter.name as string | undefined,
    slug: frontmatter.slug as string | undefined,
  }
}

// --- company context ---

export interface CompanyContext {
  companyPath: string
  projectPath: string
  projectSlug: string
}

export function resolveCompanyContext(companyPath: string, projectSlug: string): CompanyContext {
  const projectFile = path.join(companyPath, 'projects', projectSlug, 'PROJECT.md')
  if (!existsSync(projectFile)) {
    throw new CompanyError(`Project not found: ${projectFile}`)
  }

  const project = parseProjectManifest(readFileSync(projectFile, 'utf8'))
  const resolved = path.resolve(project.path)
  if (!existsSync(resolved)) {
    throw new CompanyError(`Project path does not exist: ${resolved}`)
  }

  return {
    companyPath: path.resolve(companyPath),
    projectPath: resolved,
    projectSlug,
  }
}

// Two-phase resolution:
//   Phase 1 (env vars): HORDR_COMPANY + HORDR_PROJECT → resolve + chdir.
//     Called before .beans.yml parse so the chdir takes effect first.
//   Phase 2 (config): .beans.yml `company.path` → no chdir (already in project).
//     Called after parse with the companyPath from config.
// _envChecked ensures phase 1 runs at most once; _context caches the result.
let _context: CompanyContext | null | undefined
let _envChecked = false

export function getCompanyContext(companyPath?: string): CompanyContext | null {
  if (_context !== undefined) return _context ?? null

  // Phase 1: env vars (vault entry — chdir to project path)
  if (!_envChecked) {
    _envChecked = true
    const envCompany = process.env.HORDR_COMPANY
    const envProject = process.env.HORDR_PROJECT
    if (envCompany && envProject) {
      _context = resolveCompanyContext(envCompany, envProject)
      process.chdir(_context.projectPath)
      return _context
    }
  }

  // Phase 2: config-based path (project entry — already in project dir)
  if (companyPath) {
    _context = {
      companyPath: path.resolve(companyPath),
      projectPath: process.cwd(),
      projectSlug: '',
    }

    return _context
  }

  // Cache null only when caller has provided a companyPath (both phases exhausted)
  if (companyPath !== undefined) _context = null
  return null
}

export function _resetCompanyContext(): void {
  _context = undefined
  _envChecked = false
}

// --- persona overrides ---

/** Read a skill body by slug from the company package. */
function loadSkillBody(companyPath: string, slug: string): SkillManifest {
  const skillFile = path.join(companyPath, 'skills', slug, 'SKILL.md')
  if (!existsSync(skillFile)) {
    throw new CompanyError(`Skill not found: ${skillFile}`)
  }

  return parseSkillManifest(readFileSync(skillFile, 'utf8'))
}

/**
 * Populate agent definitions from the company package.
 *
 * Scans agents/<role>/AGENTS.md for every role with a `harness:` field in
 * frontmatter (hordr-executable agents). Harness comes from frontmatter,
 * persona from the markdown body + inlined SKILL.md content.
 *
 * Roles in .beans.yml without a matching AGENTS.md are kept as fallback.
 * Roles in the company package not in .beans.yml are added.
 * AGENTS.md without `harness:` are skipped (non-executable roles like CEO).
 */
export function applyAgentOverrides(config: HordrConfig, ctx: CompanyContext): HordrConfig {
  const agents = {...config.agents}
  const agentsDir = path.join(ctx.companyPath, 'agents')

  if (existsSync(agentsDir)) {
    for (const entry of readdirSync(agentsDir, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue
      const role = entry.name
      const agentFile = path.join(agentsDir, role, 'AGENTS.md')
      if (!existsSync(agentFile)) continue

      const manifest = parseAgentManifest(readFileSync(agentFile, 'utf8'))
      // Skip non-executable roles (no harness = not a hordr agent)
      if (!manifest.harness) continue

      let persona = manifest.body.trimEnd()

      if (manifest.skills && manifest.skills.length > 0) {
        const skillsBlock = manifest.skills
          .map((slug) => {
            const skill = loadSkillBody(ctx.companyPath, slug)
            const title = skill.name ?? slug
            return `## Skill: ${title}\n\n${skill.body.trim()}`
          })
          .join('\n\n')

        persona += `\n\n--- Attached Skills ---\n\n${skillsBlock}\n`
      }

      agents[role] = {harness: manifest.harness, persona}
    }
  }

  return {...config, agents}
}
