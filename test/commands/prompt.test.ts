import type { Config } from '@oclif/core'

import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Prompt from '../../src/commands/prompt.js'
import { _setDepsForTesting, type HordrDeps } from '../../src/runtime.js'

const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({ failures: [], successes: [] }),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

interface RunResult {
  error?: Error & { oclif?: { exit?: number } }
  stderr: string
  stdout: string
}

async function invoke(args: string[]): Promise<RunResult> {
  const cmd = new Prompt(args, stubConfig)
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => {
    out.push(String(chunk))
    return true
  }

  process.stderr.write = (chunk) => {
    err.push(String(chunk))
    return true
  }

  try {
    await cmd.run()
    return { stderr: err.join(''), stdout: out.join('') }
  } catch (error) {
    return { error: error as Error & { oclif?: { exit?: number } }, stderr: err.join(''), stdout: out.join('') }
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

const YAML = `
hordr:
  primary_branch: develop
  default_harness: opencode
`

describe('commands/prompt (hordr-dme7)', () => {
  let configDir: string
  let origCwd: string
  let wtCalls: Array<{ name: string; opts?: { base?: string } }>
  let harnessCalls: Array<{ cwd: string; name: string; workspaceId: string }>
  let agentCalls: number

  const stubDeps: HordrDeps = {
    createWorktree(name, opts) {
      wtCalls.push({ name, opts })
      return { branch: name, path: `/wt/${name}`, workspaceId: 'wX' }
    },
    launchAgent() {
      agentCalls += 1
      return { paneLabel: 'never' }
    },
    launchHarness(opts) {
      harnessCalls.push(opts)
      return { paneLabel: 'wX:pNEW' }
    },
    removeWorktree() { },
  }

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-prompt-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    origCwd = process.cwd()
    process.chdir(configDir)
    wtCalls = []
    harnessCalls = []
    agentCalls = 0
    _setDepsForTesting(stubDeps)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(configDir, { force: true, recursive: true })
    _setDepsForTesting(null)
  })

  it('happy path: creates named worktree + opens bare harness pane (no bean, no role)', async () => {
    const res = await invoke(['spike-auth'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/started spike-auth in spike-auth/)

    expect(wtCalls).to.have.length(1)
    expect(wtCalls[0]).to.deep.equal({ name: 'spike-auth', opts: undefined })
    expect(harnessCalls).to.have.length(1)
    expect(harnessCalls[0]).to.deep.equal({
      cwd: '/wt/spike-auth',
      name: 'spike-auth',
      workspaceId: 'wX',
    })
    expect(agentCalls, 'prompt never dispatches bean agents').to.equal(0)
  })

  it('--base forwards to createWorktree', async () => {
    const res = await invoke(['spike-auth', '--base', 'main'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(wtCalls[0]?.opts).to.deep.equal({ base: 'main' })
  })

  it('--json emits name, branch, pane, workspace', async () => {
    const res = await invoke(['spike-auth', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {
      branch: string
      name: string
      pane: string
      workspace: string
    }
    expect(parsed).to.deep.equal({
      branch: 'spike-auth',
      name: 'spike-auth',
      pane: 'wX:pNEW',
      workspace: 'wX',
    })
  })

  it('errors when name is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
