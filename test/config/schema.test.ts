import {expect} from 'chai'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {_resetCompanyContext} from '../../src/company.js'
import {ConfigError, loadConfig} from '../../src/config/loader.js'

const VALID_YAML = `
beans:
  path: .beans
hordr:
  primary_branch: develop
  agents:
    implementer:
      harness: opencode
      persona: |
        You are the implementer.
    reviewer:
      harness: opencode
      persona: |
        You are the reviewer.
`

const MISSING_BLOCK_YAML = `
beans:
  path: .beans
  prefix: hordr-
`

const EMPTY_HARNESS_YAML = `
hordr:
  agents:
    impl:
      harness: ""
      persona: x
`

const NO_PERSONA_YAML = `
hordr:
  primary_branch: develop
  agents:
    implementer:
      harness: opencode
`

const COMPANY_NULL_YAML = `
hordr:
  company:
    # path: /tmp/foo
  primary_branch: develop
  agents:
    implementer:
      harness: opencode
      persona: x
`

describe('config/schema', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'hordr-cfg-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
    _resetCompanyContext()
    delete process.env.HORDR_COMPANY_PATH
  })

  const write = (yaml: string): string => {
    const p = path.join(dir, '.beans.yml')
    writeFileSync(p, yaml)
    return p
  }

  it('parses a valid config and returns a typed object', () => {
    const cfg = loadConfig(write(VALID_YAML))
    expect(cfg.primary_branch).to.equal('develop')
    expect(cfg.agents).to.have.property('implementer')
    expect(cfg.agents.implementer!.harness).to.equal('opencode')
    expect(cfg.agents).to.have.property('reviewer')
  })

  it('uses default agents when hordr block is missing', () => {
    const cfg = loadConfig(write(MISSING_BLOCK_YAML))
    expect(cfg.agents).to.have.property('implementer')
    expect(cfg.agents).to.have.property('tester')
    expect(cfg.agents).to.have.property('reviewer')
    expect(cfg.agents.implementer!.harness).to.equal('opencode')
    expect(cfg.agents.implementer!.persona).to.contain('hordr done')
  })

  it('produces a zod error naming the harness field when empty', () => {
    expect(() => loadConfig(write(EMPTY_HARNESS_YAML))).to.throw(ConfigError, /harness/)
  })

  it('errors when an agent has no persona (runtime validation)', () => {
    expect(() => loadConfig(write(NO_PERSONA_YAML))).to.throw(ConfigError, /no persona/)
  })

  it('accepts company: null (commented-out path block) — hordr-zn3f', () => {
    // Regression guard: a YAML block with only a comment parses as null,
    // which must not crash the loader now that company is nullable.
    expect(() => loadConfig(write(COMPANY_NULL_YAML))).to.not.throw()
  })

  it('fills unconfigured roles with defaults (merge — user agents take precedence)', () => {
    // VALID_YAML has implementer + reviewer but no tester
    const cfg = loadConfig(write(VALID_YAML))
    expect(cfg.agents).to.have.property('tester') // filled by default
    expect(cfg.agents.tester!.harness).to.equal('opencode')
    // User-configured persona is preserved, not overwritten by default
    expect(cfg.agents.implementer!.persona).to.match(/You are the implementer/)
  })

  it('default agents all have harness + persona', () => {
    const cfg = loadConfig(write(MISSING_BLOCK_YAML))
    for (const [, agent] of Object.entries(cfg.agents)) {
      expect(agent.harness).to.be.a('string').with.length.greaterThan(0)
      expect(agent.persona).to.be.a('string').with.length.greaterThan(0)
    }
  })

  it('HORDR_COMPANY_PATH env var loads agents from the company package', () => {
    // Create a minimal company package with a custom role
    const companyDir = path.join(dir, 'my-company')
    const agentDir = path.join(companyDir, 'agents', 'custom-role')
    mkdirSync(agentDir, {recursive: true})
    writeFileSync(path.join(agentDir, 'AGENTS.md'), '---\nharness: opencode\n---\nYou are a custom agent.')

    process.env.HORDR_COMPANY_PATH = companyDir
    _resetCompanyContext()

    const cfg = loadConfig(write(MISSING_BLOCK_YAML))
    expect(cfg.agents).to.have.property('custom-role')
    expect(cfg.agents['custom-role']!.harness).to.equal('opencode')
  })

  it('HORDR_COMPANY_PATH overrides config company.path', () => {
    // Config sets company.path to dir A; env var points to dir B with a different role
    const companyA = path.join(dir, 'company-a')
    const companyB = path.join(dir, 'company-b')
    mkdirSync(path.join(companyA, 'agents', 'role-a'), {recursive: true})
    writeFileSync(path.join(companyA, 'agents', 'role-a', 'AGENTS.md'), '---\nharness: opencode\n---\nRole A.')
    mkdirSync(path.join(companyB, 'agents', 'role-b'), {recursive: true})
    writeFileSync(path.join(companyB, 'agents', 'role-b', 'AGENTS.md'), '---\nharness: claude\n---\nRole B.')

    // Config points to A, env var points to B → B wins
    const yaml = `
beans:
  path: .beans
hordr:
  company:
    path: ${companyA}
`
    process.env.HORDR_COMPANY_PATH = companyB
    _resetCompanyContext()

    const cfg = loadConfig(write(yaml))
    expect(cfg.agents).to.have.property('role-b')
    expect(cfg.agents).to.not.have.property('role-a')
  })
})
