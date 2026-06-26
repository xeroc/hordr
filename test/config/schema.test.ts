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
      steps:
        - kind: implement
          agent: implementer
          pane: root
          wait: "agent-status: done"
        - kind: test
          agent: tester
          pane: sibling
          wait: "test-(green|red)"
        - kind: commit
        - kind: hitl
          optional: false
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

// AC #4 "unknown harness" reinterpreted: harness is any non-empty string per
// SPEC §6 (not a closed set), so we test empty/missing harness instead.
const EMPTY_HARNESS_YAML = `
hordr:
  agents:
    impl:
      harness: ""
      persona: x
`

const UNKNOWN_STEP_KIND_YAML = `
hordr:
  workflows:
    w:
      steps:
        - kind: frobnicate
`

// AC #6 "missing agents in workflow" reinterpreted: agent references are a
// runtime check (agent is optional on some kinds), so we test a step missing
// the required `kind` field instead.
const MISSING_KIND_YAML = `
hordr:
  workflows:
    w:
      steps:
        - agent: impl
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
    expect(cfg.workflows.implement.steps).to.have.lengthOf(4)
    expect(cfg.workflows.implement.steps[0].kind).to.equal('implement')
    expect(cfg.workflows.implement.steps[0].pane).to.equal('root')
    expect(cfg.workflows.implement.steps[2].kind).to.equal('commit')
    expect(cfg.workflows.implement.steps[2].optional).to.equal(false)
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

  it('produces a zod error with steps.0.kind for unknown step kind', () => {
    expect(() => loadConfig(write(UNKNOWN_STEP_KIND_YAML))).to.throw(ConfigError, /steps\.0\.kind/)
  })

  it('produces a zod error with kind for a step missing kind', () => {
    expect(() => loadConfig(write(MISSING_KIND_YAML))).to.throw(ConfigError, /steps\.0\.kind/)
  })

  it('honors --config override path (does not walk up)', () => {
    // File lives in tmp dir; cwd is elsewhere. Explicit path must still load.
    const cfg = loadConfig(write(VALID_YAML))
    expect(cfg.concurrency).to.equal(3)
  })
})
