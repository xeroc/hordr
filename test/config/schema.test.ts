import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {ConfigError, loadConfig} from '../../src/config/index.js'

const VALID_YAML = `
beans:
  path: .beans
hordr:
  concurrency: 3
  primary_branch: develop
  worktree_branch_prefix: bean/
  agents:
    implementer:
      harness: opencode
      persona: |
        You are the implementer.
    tester:
      harness: opencode
      persona: |
        You are the tester.
  workflows:
    implement:
      worktree: true
      steps:
        - agent: implementer
        - agent: tester
        - hitl: external
  routing:
    default_workflow: implement
    plan_workflow: plan
`

const MISSING_BLOCK_YAML = `
beans:
  path: .beans
  prefix: hordr-
`

const INVALID_CONCURRENCY_YAML = `
hordr:
  concurrency: "three"
`

const EMPTY_HARNESS_YAML = `
hordr:
  agents:
    impl:
      harness: ""
      persona: x
`

const INVALID_STEP_YAML = `
hordr:
  workflows:
    w:
      steps:
        - kind: frobnicate
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
    expect(cfg.concurrency).to.equal(3)
    expect(cfg.primary_branch).to.equal('develop')
    expect(cfg.worktree_branch_prefix).to.equal('bean/')
    expect(cfg.agents).to.have.property('implementer')
    expect(cfg.agents.implementer.harness).to.equal('opencode')
    expect(cfg.workflows.implement.steps).to.have.lengthOf(3)
    expect(cfg.workflows.implement.worktree).to.equal(true)
    const s0 = cfg.workflows.implement.steps[0]
    const s2 = cfg.workflows.implement.steps[2]
    expect('agent' in s0 && s0.agent).to.equal('implementer')
    expect('hitl' in s2 && s2.hitl).to.equal('external')
    expect(cfg.routing?.default_workflow).to.equal('implement')
    expect(cfg.routing?.plan_workflow).to.equal('plan')
  })

  it('exits non-zero with "No hordr config found" when block is missing', () => {
    expect(() => loadConfig(write(MISSING_BLOCK_YAML))).to.throw(ConfigError, 'No hordr config found')
  })

  it('produces a zod error naming `concurrency` for invalid type', () => {
    expect(() => loadConfig(write(INVALID_CONCURRENCY_YAML))).to.throw(ConfigError, /concurrency/)
  })

  it('produces a zod error naming the harness field when empty', () => {
    expect(() => loadConfig(write(EMPTY_HARNESS_YAML))).to.throw(ConfigError, /harness/)
  })

  it('rejects unknown step shape (not agent or hitl)', () => {
    expect(() => loadConfig(write(INVALID_STEP_YAML))).to.throw(ConfigError)
  })

  it('honors --config override path (does not walk up)', () => {
    const cfg = loadConfig(write(VALID_YAML))
    expect(cfg.concurrency).to.equal(3)
  })
})
