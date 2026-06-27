/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields; RunState fields use snake_case per on-disk contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import Run from '../../src/commands/run.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {putRun} from '../../src/state/index.js'

// ponytail: inline stub config — satisfies oclif Command.parse()/error() without
// the full Config.load() dance (which would target dist/ and create a different
// module instance from the TS source under test). runHook returns empty results
// so the preparse hook (called by parse()) is a no-op.
const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({failures: [], successes: []}),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

interface RunResult {
  error?: Error & {oclif?: {exit?: number}}
  stderr: string
  stdout: string
}

async function invoke(args: string[]): Promise<RunResult> {
  const cmd = new Run(args, stubConfig)
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  process.stderr.write = (chunk) => {
    err.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  try {
    await cmd.run()
    return {stderr: err.join(''), stdout: out.join('')}
  } catch (error) {
    return {error: error as Error & {oclif?: {exit?: number}}, stderr: err.join(''), stdout: out.join('')}
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

const YAML = `
hordr:
  concurrency: 2
`

const VALID_BODY = `## Requirement

Need a thing.

## Spec

Build it.

## Acceptance Criteria

- [ ] AC one

## Test Plan

Run tests.
`

const BEAN_JSON_TODO = JSON.stringify({
  body: VALID_BODY,
  created_at: '2026-01-01T00:00:00Z',
  etag: 'e1',
  id: 'hordr-1602',
  path: 'hordr-1602.md',
  priority: 'normal',
  slug: 'x',
  status: 'todo',
  title: 'T',
  type: 'task',
  updated_at: '2026-01-01T00:00:00Z',
})

const BEAN_JSON_INPROGRESS = JSON.stringify({...JSON.parse(BEAN_JSON_TODO), status: 'in-progress'})

describe('commands/run', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string
  let origHerdrBin: string | undefined

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-run-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-run-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    // Redirect the detached supervisor spawn to /bin/true (no-op, exits 0).
    origHerdrBin = process.env.HERDR_BIN_PATH
    process.env.HERDR_BIN_PATH = '/bin/true'
    _setBeansPresentForTesting(true)
    _setShellForTesting((_cmd, args) => {
      if (args[0] === 'show') return BEAN_JSON_TODO
      if (args[0] === 'update') return BEAN_JSON_TODO
      throw new Error(`unexpected beans call: ${args.join(' ')}`)
    })
    _setDepsForTesting(null)
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    if (origHerdrBin === undefined) delete process.env.HERDR_BIN_PATH
    else process.env.HERDR_BIN_PATH = origHerdrBin
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
    _resetShell()
    _setBeansPresentForTesting(true)
    _setDepsForTesting(null)
  })

  it('happy path: bean todo, run queued → starts running and spawns supervisor (AC #1)', async () => {
    putRun({
      bean: 'hordr-1602',
      panes: {},
      started_unix: 1,
      status: 'queued',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['hordr-1602'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/started hordr-1602 \(supervisor pane spawned\)/)
  })

  it('rejects if bean status is not todo', async () => {
    _setShellForTesting(() => BEAN_JSON_INPROGRESS)
    putRun({
      bean: 'hordr-1602',
      panes: {},
      started_unix: 1,
      status: 'queued',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['hordr-1602'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/not approved/)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('rejects if no run exists for the bean', async () => {
    const res = await invoke(['hordr-1602'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/no run found/)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('rejects if run is not in queued status', async () => {
    putRun({
      bean: 'hordr-1602',
      panes: {},
      started_unix: 1,
      status: 'running',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['hordr-1602'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.message).to.match(/expected 'queued'/)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('--json emits parseable JSON with bean and outcome', async () => {
    putRun({
      bean: 'hordr-1602',
      panes: {},
      started_unix: 1,
      status: 'queued',
      step: 0,
      updated_unix: 1,
      workflow: 'implement',
      worktree: null,
    })

    const res = await invoke(['hordr-1602', '--json'])

    expect(res.error).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {bean: string; outcome: string}
    expect(parsed.bean).to.equal('hordr-1602')
    expect(parsed.outcome).to.equal('running')
  })

  // ---- ADR-0010: decomposed children skip planning ----

  it('child of completed epic with no Run: creates Run directly at queued (ADR-0010)', async () => {
    // Bean with a completed epic parent. Mock beans to return parent info.
    const childBean = JSON.stringify({
      ...JSON.parse(BEAN_JSON_TODO),
      id: 'hordr-child1',
      parent_id: 'hordr-epic1',
    })
    const epicBean = JSON.stringify({
      body: VALID_BODY,
      created_at: '2026-01-01T00:00:00Z',
      etag: 'e2',
      id: 'hordr-epic1',
      path: 'hordr-epic1.md',
      priority: 'normal',
      slug: 'epic',
      status: 'completed',
      title: 'Epic',
      type: 'epic',
      updated_at: '2026-01-01T00:00:00Z',
    })
    let callCount = 0
    _setShellForTesting(() => {
      callCount++
      // Alternating: child, epic, child (for getBody), then child (for setWorkflow return).
      return callCount % 2 === 1 ? childBean : epicBean
    })
    _setDepsForTesting({
      createWorktree: () => ({branch: 'bean/x', workspaceId: 'wX'}),
      detectTestSignal: () => null,
      launchAgent: () => ({paneLabel: 'wX:p1'}),
      paneExists: () => true,
      readAgentOutput: () => '',
      removeWorktree() {},
      waitForAgentDone() {},
    } as unknown as Parameters<typeof _setDepsForTesting>[0])

    const res = await invoke(['hordr-child1'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/started hordr-child1/)
  })

  it('child of non-completed epic: falls through to standalone path (requires prior plan)', async () => {
    const childBean = JSON.stringify({
      ...JSON.parse(BEAN_JSON_TODO),
      id: 'hordr-child2',
      parent_id: 'hordr-epic2',
    })
    const epicBean = JSON.stringify({
      body: VALID_BODY,
      created_at: '2026-01-01T00:00:00Z',
      etag: 'e3',
      id: 'hordr-epic2',
      path: 'hordr-epic2.md',
      priority: 'normal',
      slug: 'epic',
      status: 'todo', // not completed yet
      title: 'Epic',
      type: 'epic',
      updated_at: '2026-01-01T00:00:00Z',
    })
    let callCount = 0
    _setShellForTesting(() => {
      callCount++
      return callCount % 2 === 1 ? childBean : epicBean
    })

    const res = await invoke(['hordr-child2'])

    expect(res.error).to.exist
    // Falls through to "no run found" since no prior plan created one.
    expect(res.error!.message).to.match(/no run found/)
  })

  it('refuses if body fails validate-spec (protects against half-decomposed children)', async () => {
    const badBean = JSON.stringify({
      ...JSON.parse(BEAN_JSON_TODO),
      body: '## Requirement\n\nOnly this.\n', // missing 3 sections
    })
    _setShellForTesting(() => badBean)

    const res = await invoke(['hordr-1602'])

    expect(res.error).to.exist
    expect(res.error!.message).to.match(/body invalid/)
  })
})
