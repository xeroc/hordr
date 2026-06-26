import type {Config} from '@oclif/core'

/* eslint-disable camelcase -- round-trips SPEC.md §3 snake_case JSON fields */
import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {PassThrough} from 'node:stream'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import Reset from '../../src/commands/reset.js'
import {_setDepsForTesting} from '../../src/runtime.js'
import {putRun} from '../../src/state/index.js'
import {makeDeps} from '../engine/helpers.js'

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

// Capture stdout/stderr and inject a fake stdin so we can drive the y/N prompt.
async function invoke(args: string[], stdinInput = ''): Promise<RunResult> {
  const cmd = new Reset(args, stubConfig)
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const origStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
  // ponytail: PassThrough typed loosely — readline only needs a readable stream.
  const fakeStdin = new PassThrough() as unknown as typeof process.stdin
  Object.defineProperty(process, 'stdin', {configurable: true, value: fakeStdin, writable: true})
  process.stdout.write = (chunk) => {
    out.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  process.stderr.write = (chunk) => {
    err.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }

  try {
    if (stdinInput) {
      // Defer so createInterface is listening before we emit data.
      process.nextTick(() => {
        fakeStdin.write(stdinInput)
        fakeStdin.end()
      })
    }

    await cmd.run()
    return {stderr: err.join(''), stdout: out.join('')}
  } catch (error) {
    return {error: error as Error & {oclif?: {exit?: number}}, stderr: err.join(''), stdout: out.join('')}
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
    if (origStdinDescriptor) Object.defineProperty(process, 'stdin', origStdinDescriptor)
  }
}

const YAML = `
hordr:
  concurrency: 2
`

// beans show returns a bean; update returns a status echo.
function beansShell(_cmd: string, args: string[]): string {
  if (args[0] === 'show') {
    return JSON.stringify({
      body: '',
      created_at: '2026-01-01T00:00:00Z',
      etag: 'e1',
      id: 'b1',
      path: 'b1.md',
      priority: 'normal',
      slug: 'x',
      status: 'in-progress',
      title: 'T',
      type: 'task',
      updated_at: '2026-01-01T00:00:00Z',
    })
  }

  if (args[0] === 'update' && args.includes('--status')) {
    const idx = args.indexOf('--status')
    return JSON.stringify({status: args[idx + 1]})
  }

  throw new Error(`unexpected beans call: ${args.join(' ')}`)
}

function seedRun(worktree: null | {branch: string; path?: string; workspace_id: string} = null): void {
  putRun({
    bean: 'b1',
    panes: {},
    started_unix: 1,
    status: 'blocked',
    step: 0,
    updated_unix: 1,
    workflow: 'implement',
    worktree,
  })
}

describe('commands/reset', () => {
  let stateDir: string
  let configDir: string
  let origCwd: string
  let removed: string[]

  beforeEach(() => {
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-reset-st-'))
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-reset-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    origCwd = process.cwd()
    process.chdir(configDir)
    removed = []
    _setBeansPresentForTesting(true)
    _setShellForTesting(beansShell)
    _setDepsForTesting(
      makeDeps({
        removeWorktree(wsId) {
          removed.push(wsId)
        },
      }),
    )
  })

  afterEach(() => {
    process.chdir(origCwd)
    delete process.env.HERDR_PLUGIN_STATE_DIR
    rmSync(stateDir, {force: true, recursive: true})
    rmSync(configDir, {force: true, recursive: true})
    _resetShell()
    _setBeansPresentForTesting(true)
    _setDepsForTesting(null)
  })

  it('happy path with --force: deletes run, removes worktree, bean → todo', async () => {
    seedRun({branch: 'bean/b1', workspace_id: 'wX'})

    const res = await invoke(['b1', '--force'])

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/reset b1/)
    expect(removed).to.deep.equal(['wX'])
  })

  it('without --force: prompt "y" → proceeds', async () => {
    seedRun({branch: 'bean/b1', workspace_id: 'wX'})

    const res = await invoke(['b1'], 'y\n')

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/reset b1/)
    expect(removed).to.deep.equal(['wX'])
  })

  it('without --force: prompt "n" → aborts (AC #5)', async () => {
    seedRun({branch: 'bean/b1', workspace_id: 'wX'})

    const res = await invoke(['b1'], 'n\n')

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/aborted/)
    expect(removed).to.have.lengthOf(0)
  })

  it('without --force: empty answer → aborts', async () => {
    seedRun()

    const res = await invoke(['b1'], '\n')

    expect(res.error).to.be.undefined
    expect(res.stdout).to.match(/aborted/)
  })

  it('--json emits parseable JSON', async () => {
    seedRun({branch: 'bean/b1', workspace_id: 'wX'})

    const res = await invoke(['b1', '--force', '--json'])

    expect(res.error).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {bean: string; reset: boolean}
    expect(parsed.bean).to.equal('b1')
    expect(parsed.reset).to.equal(true)
  })

  it('removeWorktree failure warns but continues with state deletion', async () => {
    _setDepsForTesting(
      makeDeps({
        removeWorktree() {
          throw new Error('boom: worktree already gone')
        },
      }),
    )
    seedRun({branch: 'bean/b1', workspace_id: 'wX'})

    const res = await invoke(['b1', '--force'])

    expect(res.error).to.be.undefined
    expect(res.stderr + res.stdout).to.match(/worktree removal failed/)
    expect(res.stdout).to.match(/reset b1/)
  })

  it('rejects if no run exists', async () => {
    const res = await invoke(['nope', '--force'])

    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })

  it('skips worktree removal when run has no worktree', async () => {
    seedRun(null)

    const res = await invoke(['b1', '--force'])

    expect(res.error).to.be.undefined
    expect(removed).to.have.lengthOf(0)
    expect(res.stdout).to.match(/reset b1/)
  })
})
