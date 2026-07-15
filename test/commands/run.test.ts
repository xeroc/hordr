/* eslint-disable camelcase -- SAMPLE_BEAN mirrors the on-disk beans JSON contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../src/beans/client.js'
import Run from '../../src/commands/run.js'
import {_setDepsForTesting, type HordrDeps} from '../../src/runtime.js'

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
  primary_branch: develop
  agents:
    implementer:
      harness: opencode
      persona: "implement"
    reviewer:
      harness: opencode
      persona: "review"
`

const SAMPLE_BEAN = {
  body: '## Requirement\n\nDo the thing.\n',
  created_at: '2026-01-01T00:00:00Z',
  etag: 'e1',
  id: 'hordr-1234',
  path: 'hordr-1234.md',
  priority: 'normal',
  slug: 'x',
  status: 'todo',
  title: 'T',
  type: 'task',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('commands/run (minimal, hordr-zn3f)', () => {
  let configDir: string
  let origCwd: string
  let depsCalls: Array<{beanId: string; cwd: string; role: string; workspaceId: string}>
  let wtCalls: Array<{beanId: string; opts?: {base?: string}}>

  const stubDeps: HordrDeps = {
    createWorktree(beanId, opts) {
      wtCalls.push({beanId, opts})
      return {branch: `${beanId}`, path: `/wt/${beanId}`, workspaceId: 'wX'}
    },
    launchAgent(opts) {
      depsCalls.push(opts)
      return {paneLabel: 'wX:pNEW'}
    },
    removeWorktree() {},
  }

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-run-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    origCwd = process.cwd()
    process.chdir(configDir)
    depsCalls = []
    wtCalls = []
    _setDepsForTesting(stubDeps)
    _setBeansShell(() => JSON.stringify(SAMPLE_BEAN))
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(configDir, {force: true, recursive: true})
    _setDepsForTesting(null)
    _resetBeansShell()
  })

  it('happy path: creates worktree + launches agent with default role', async () => {
    const res = await invoke(['hordr-1234'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/started hordr-1234 in bean\/hordr-1234/)
    expect(res.stdout).to.match(/role: implementer/)

    expect(wtCalls).to.have.length(1)
    expect(wtCalls[0]).to.deep.equal({beanId: 'hordr-1234', opts: undefined})
    expect(depsCalls).to.have.length(1)
    expect(depsCalls[0]).to.deep.equal({
      beanId: 'hordr-1234',
      cwd: '/wt/hordr-1234',
      role: 'implementer',
      workspaceId: 'wX',
    })
  })

  it('--role overrides the default', async () => {
    const res = await invoke(['hordr-1234', '--role', 'reviewer'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(depsCalls[0]?.role).to.equal('reviewer')
  })

  it('--base forwards to createWorktree', async () => {
    const res = await invoke(['hordr-1234', '--base', 'main'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(wtCalls[0]?.opts).to.deep.equal({base: 'main'})
  })

  it('--json emits bean, branch, pane, role, workspace', async () => {
    const res = await invoke(['hordr-1234', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      bean: string
      branch: string
      pane: string
      role: string
      workspace: string
    }
    expect(parsed).to.deep.equal({
      bean: 'hordr-1234',
      branch: 'hordr-1234',
      pane: 'wX:pNEW',
      role: 'implementer',
      workspace: 'wX',
    })
  })

  it('errors when bean id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
