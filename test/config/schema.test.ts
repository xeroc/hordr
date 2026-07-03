import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {ConfigError, loadConfig} from '../../src/config/index.js'

const VALID_YAML = `
beans:
  path: .beans
hordr:
  primary_branch: develop
  worktree_branch_prefix: bean/
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
  })

  const write = (yaml: string): string => {
    const p = path.join(dir, '.beans.yml')
    writeFileSync(p, yaml)
    return p
  }

  it('parses a valid config and returns a typed object', () => {
    const cfg = loadConfig(write(VALID_YAML))
    expect(cfg.primary_branch).to.equal('develop')
    expect(cfg.worktree_branch_prefix).to.equal('bean/')
    expect(cfg.agents).to.have.property('implementer')
    expect(cfg.agents.implementer!.harness).to.equal('opencode')
    expect(cfg.agents).to.have.property('reviewer')
  })

  it('exits non-zero with "No hordr config found" when block is missing', () => {
    expect(() => loadConfig(write(MISSING_BLOCK_YAML))).to.throw(ConfigError, 'No hordr config found')
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
})
