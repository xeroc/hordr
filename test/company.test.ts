/* eslint-disable camelcase -- manifest fields mirror Agent Companies spec names */
import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import process from 'node:process'

import type {HordrConfig} from '../src/config/schema.js'

import {
  _resetCompanyContext,
  applyAgentOverrides,
  CompanyError,
  getCompanyContext,
  parseAgentManifest,
  parseCompanyManifest,
  parseFrontmatter,
  parseProjectManifest,
  parseSkillManifest,
  resolveCompanyContext,
} from '../src/company.js'

const AGENTS_MD = `---
name: Implementer
slug: implementer
harness: opencode
skills:
  - commit-conventional
  - test-patterns
reportsTo: null
---

You implement a single task bean.
Read the bean: beans show <bean-id>
Do the work.
`

const PROJECT_MD = `---
name: Hordr
slug: hordr
path: PROJECT_PATH_PLACEHOLDER
---

# Hordr project description.
Some body text.
`

const SKILL_MD = `---
name: Commit Conventional
slug: commit-conventional
---

Always use conventional commit messages.
Format: type(scope): description
`

const COMPANY_MD = `---
name: Lean Dev Shop
slug: lean-dev-shop
schema: agentcompanies/v1
---

A small engineering-focused AI company.
`

const NO_FRONTMATTER = `Just some markdown body.
No frontmatter here.
`

describe('company', () => {
  describe('manifest', () => {
    it('parseFrontmatter extracts YAML frontmatter and body', () => {
      const {body, frontmatter} = parseFrontmatter(AGENTS_MD)
      expect(frontmatter).to.have.property('name', 'Implementer')
      expect(frontmatter).to.have.property('slug', 'implementer')
      expect(frontmatter.skills as string[]).to.deep.equal(['commit-conventional', 'test-patterns'])
      expect(body.trimStart()).to.match(/^You implement/)
    })

    it('parseFrontmatter returns full content as body when no frontmatter', () => {
      const {body, frontmatter} = parseFrontmatter(NO_FRONTMATTER)
      expect(frontmatter).to.deep.equal({})
      expect(body).to.equal(NO_FRONTMATTER)
    })

    it('parseAgentManifest extracts skills, name, harness, and persona body', () => {
      const m = parseAgentManifest(AGENTS_MD)
      expect(m.name).to.equal('Implementer')
      expect(m.slug).to.equal('implementer')
      expect(m.harness).to.equal('opencode')
      expect(m.skills).to.deep.equal(['commit-conventional', 'test-patterns'])
      expect(m.body).to.match(/You implement/)
      expect(m.body).to.not.match(/^---/)
    })

    it('parseAgentManifest handles missing optional fields', () => {
      const m = parseAgentManifest('Just a persona body, no frontmatter.')
      expect(m.name).to.be.undefined
      expect(m.skills).to.be.undefined
      expect(m.body).to.equal('Just a persona body, no frontmatter.')
    })

    it('parseProjectManifest extracts path field', () => {
      const m = parseProjectManifest(PROJECT_MD.replace('PROJECT_PATH_PLACEHOLDER', '/tmp/foo'))
      expect(m.name).to.equal('Hordr')
      expect(m.slug).to.equal('hordr')
      expect(m.path).to.equal('/tmp/foo')
      expect(m.body).to.match(/Hordr project/)
    })

    it('parseProjectManifest throws when path field missing', () => {
      const raw = `---
name: NoPath
slug: no-path
---
Body without path.
`
      expect(() => parseProjectManifest(raw)).to.throw(CompanyError, /path/)
    })

    it('parseSkillManifest extracts body', () => {
      const m = parseSkillManifest(SKILL_MD)
      expect(m.name).to.equal('Commit Conventional')
      expect(m.slug).to.equal('commit-conventional')
      expect(m.body).to.match(/conventional commit/)
    })

    it('parseCompanyManifest extracts name and slug', () => {
      const m = parseCompanyManifest(COMPANY_MD)
      expect(m.name).to.equal('Lean Dev Shop')
      expect(m.slug).to.equal('lean-dev-shop')
      expect(m.body).to.match(/engineering-focused/)
    })
  })

  describe('context', () => {
    let companyDir: string
    let projectDir: string
    let savedCwd: string

    beforeEach(() => {
      savedCwd = process.cwd()
      _resetCompanyContext()
      delete process.env.HORDR_COMPANY
      delete process.env.HORDR_PROJECT

      companyDir = mkdtempSync(path.join(tmpdir(), 'hordr-co-'))
      projectDir = mkdtempSync(path.join(tmpdir(), 'hordr-proj-'))

      // Scaffold a minimal company package
      mkdirSync(path.join(companyDir, 'projects', 'hordr'), {recursive: true})
      mkdirSync(path.join(companyDir, 'agents', 'implementer'), {recursive: true})
      mkdirSync(path.join(companyDir, 'skills', 'commit-conventional'), {recursive: true})

      writeFileSync(path.join(companyDir, 'COMPANY.md'), COMPANY_MD)
      writeFileSync(
        path.join(companyDir, 'projects', 'hordr', 'PROJECT.md'),
        PROJECT_MD.replace('PROJECT_PATH_PLACEHOLDER', projectDir),
      )
      writeFileSync(path.join(companyDir, 'agents', 'implementer', 'AGENTS.md'), AGENTS_MD)
      writeFileSync(path.join(companyDir, 'skills', 'commit-conventional', 'SKILL.md'), SKILL_MD)
    })

    afterEach(() => {
      process.chdir(savedCwd)
      _resetCompanyContext()
      delete process.env.HORDR_COMPANY
      delete process.env.HORDR_PROJECT
      rmSync(companyDir, {force: true, recursive: true})
      rmSync(projectDir, {force: true, recursive: true})
    })

    it('resolveCompanyContext reads PROJECT.md and returns paths', () => {
      const ctx = resolveCompanyContext(companyDir, 'hordr')
      expect(ctx.companyPath).to.equal(companyDir)
      expect(ctx.projectSlug).to.equal('hordr')
      expect(ctx.projectPath).to.equal(projectDir)
    })

    it('resolveCompanyContext throws when PROJECT.md not found', () => {
      expect(() => resolveCompanyContext(companyDir, 'nonexistent')).to.throw(CompanyError, /Project not found/)
    })

    it('resolveCompanyContext throws when project path does not exist on disk', () => {
      writeFileSync(
        path.join(companyDir, 'projects', 'hordr', 'PROJECT.md'),
        PROJECT_MD.replace('PROJECT_PATH_PLACEHOLDER', '/nonexistent/path/xyz'),
      )
      expect(() => resolveCompanyContext(companyDir, 'hordr')).to.throw(CompanyError, /does not exist/)
    })

    it('getCompanyContext returns null when env vars unset', () => {
      expect(getCompanyContext()).to.be.null
    })

    it('getCompanyContext resolves + chdir when env vars set', () => {
      process.env.HORDR_COMPANY = companyDir
      process.env.HORDR_PROJECT = 'hordr'
      const ctx = getCompanyContext()
      expect(ctx).to.not.be.null
      expect(ctx!.projectPath).to.equal(projectDir)
      expect(process.cwd()).to.equal(projectDir)
    })

    it('getCompanyContext is memoized (chdir only on first call)', () => {
      process.env.HORDR_COMPANY = companyDir
      process.env.HORDR_PROJECT = 'hordr'
      const ctx1 = getCompanyContext()
      // chdir away to prove the second call doesn't re-resolve
      process.chdir(savedCwd)
      const ctx2 = getCompanyContext()
      expect(ctx2).to.equal(ctx1)
    })

    it('getCompanyContext resolves from config companyPath (no env vars, no chdir)', () => {
      const ctx = getCompanyContext(companyDir)
      expect(ctx).to.not.be.null
      expect(ctx!.companyPath).to.equal(companyDir)
      expect(ctx!.projectPath).to.equal(process.cwd())
      expect(ctx!.projectSlug).to.equal('')
    })

    it('env vars take priority over config companyPath', () => {
      process.env.HORDR_COMPANY = companyDir
      process.env.HORDR_PROJECT = 'hordr'
      const ctx = getCompanyContext('/some/other/path')
      expect(ctx!.projectPath).to.equal(projectDir)
      expect(ctx!.projectSlug).to.equal('hordr')
    })
  })

  describe('persona-override', () => {
    let companyDir: string
    let projectDir: string

    beforeEach(() => {
      companyDir = mkdtempSync(path.join(tmpdir(), 'hordr-co-'))
      projectDir = mkdtempSync(path.join(tmpdir(), 'hordr-proj-'))

      mkdirSync(path.join(companyDir, 'agents', 'implementer'), {recursive: true})
      mkdirSync(path.join(companyDir, 'agents', 'tester'), {recursive: true})
      mkdirSync(path.join(companyDir, 'skills', 'commit-conventional'), {recursive: true})
      mkdirSync(path.join(companyDir, 'skills', 'test-patterns'), {recursive: true})

      writeFileSync(path.join(companyDir, 'agents', 'implementer', 'AGENTS.md'), AGENTS_MD)
      writeFileSync(
        path.join(companyDir, 'agents', 'tester', 'AGENTS.md'),
        '---\nname: Tester\nharness: opencode\n---\nYou test things.\n',
      )
      writeFileSync(path.join(companyDir, 'skills', 'commit-conventional', 'SKILL.md'), SKILL_MD)
      writeFileSync(
        path.join(companyDir, 'skills', 'test-patterns', 'SKILL.md'),
        '---\nname: Test Patterns\nslug: test-patterns\n---\nWrite tests first. RED then GREEN.\n',
      )
    })

    afterEach(() => {
      rmSync(companyDir, {force: true, recursive: true})
      rmSync(projectDir, {force: true, recursive: true})
    })

    const baseConfig: HordrConfig = {
      agents: {
        implementer: {harness: 'opencode', persona: 'ORIGINAL-IMPLEMENTER-PERSONA'},
        reviewer: {harness: 'opencode', persona: 'ORIGINAL-REVIEWER-PERSONA'},
        tester: {harness: 'opencode', persona: 'ORIGINAL-TESTER-PERSONA'},
      },
      concurrency: 3,
      primary_branch: 'develop',
      workflows: {},
      worktree_branch_prefix: 'bean/',
    }

    it('overrides persona from AGENTS.md body', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents.implementer!.persona).to.match(/You implement/)
      expect(result.agents.implementer!.persona).to.not.include('ORIGINAL-IMPLEMENTER')
    })

    it('appends inlined skills to persona', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents.implementer!.persona).to.include('conventional commit')
      expect(result.agents.implementer!.persona).to.include('Commit Conventional')
    })

    it('keeps .beans.yml persona when no AGENTS.md for role', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      // reviewer has no AGENTS.md in the company package
      expect(result.agents.reviewer!.persona).to.equal('ORIGINAL-REVIEWER-PERSONA')
    })

    it('overrides persona without skills when AGENTS.md has no skills list', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents.tester!.persona).to.equal('You test things.')
    })

    it('throws when referenced skill not found', () => {
      writeFileSync(
        path.join(companyDir, 'agents', 'implementer', 'AGENTS.md'),
        '---\nname: Impl\nharness: opencode\nskills:\n  - nonexistent-skill\n---\nBody.\n',
      )
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      expect(() => applyAgentOverrides(baseConfig, ctx)).to.throw(CompanyError, /Skill not found/)
    })

    it('does not mutate the original config', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const original = {...baseConfig, agents: {...baseConfig.agents}}
      applyAgentOverrides(baseConfig, ctx)
      expect(baseConfig.agents.implementer!.persona).to.equal(original.agents.implementer!.persona)
    })

    it('harness comes from AGENTS.md frontmatter', () => {
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents.implementer!.harness).to.equal('opencode')
    })

    it('adds new roles from company package not in .beans.yml', () => {
      mkdirSync(path.join(companyDir, 'agents', 'researcher'), {recursive: true})
      writeFileSync(
        path.join(companyDir, 'agents', 'researcher', 'AGENTS.md'),
        '---\nname: Researcher\nharness: claude\n---\nYou research things.\n',
      )
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents.researcher).to.exist
      expect(result.agents.researcher!.harness).to.equal('claude')
      expect(result.agents.researcher!.persona).to.equal('You research things.')
    })

    it('skips AGENTS.md without harness field (non-executable role)', () => {
      mkdirSync(path.join(companyDir, 'agents', 'ceo'), {recursive: true})
      writeFileSync(
        path.join(companyDir, 'agents', 'ceo', 'AGENTS.md'),
        '---\nname: CEO\nreportsTo: null\n---\nYou are the CEO.\n',
      )
      const ctx = {companyPath: companyDir, projectPath: projectDir, projectSlug: 'hordr'}
      const result = applyAgentOverrides(baseConfig, ctx)
      expect(result.agents).to.not.have.property('ceo')
    })
  })
})
