/* eslint-disable camelcase -- mirrors herdr JSON contract */
import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Cleanup from '../../src/commands/cleanup.js'
import {
  _resetShell as _resetWtShell,
  _setShellForTesting as _setWtShell,
  HerdrError,
  type ShellFn,
} from '../../src/herdr/worktree.js'

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
  const cmd = new Cleanup(args, stubConfig)
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
  worktree_branch_prefix: bean/
  agents:
    implementer:
      harness: opencode
      persona: x
`

const OPEN_RESULT = {
  workspace: {workspace_id: 'wP'},
  worktree: {branch: 'bean/hordr-1234', path: '/wt/hordr-1234'},
}

describe('commands/cleanup (hordr-zn3f)', () => {
  let configDir: string
  let origCwd: string
  let calls: string[][]
  const mockShell: ShellFn = (args) => {
    calls.push(args)
    if (args[0] === 'worktree' && args[1] === 'open') return JSON.stringify({result: OPEN_RESULT})
    if (args[0] === 'worktree' && args[1] === 'remove') return JSON.stringify({result: {ok: true}})
    throw new Error(`unexpected herdr call: ${args.join(' ')}`)
  }

  beforeEach(() => {
    configDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-cln-cfg-'))
    writeFileSync(path.join(configDir, '.beans.yml'), YAML)
    origCwd = process.cwd()
    process.chdir(configDir)
    calls = []
    _setWtShell(mockShell)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(configDir, {force: true, recursive: true})
    _resetWtShell()
  })

  it('opens the worktree by branch then removes it', async () => {
    const res = await invoke(['hordr-1234'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/removed worktree for hordr-1234/)

    const openCall = calls.find((c) => c[1] === 'open')
    expect(openCall).to.include.members(['--branch', 'bean/hordr-1234'])
    const removeCall = calls.find((c) => c[1] === 'remove')
    expect(removeCall).to.include.members(['--workspace', 'wP'])
  })

  it('--force forwards to removeWorktree', async () => {
    const res = await invoke(['hordr-1234', '--force'])

    expect(res.error, res.error?.message).to.be.undefined
    const removeCall = calls.find((c) => c[1] === 'remove')
    expect(removeCall).to.include('--force')
  })

  it('--json emits bean, branch, removed, workspace', async () => {
    const res = await invoke(['hordr-1234', '--json'])

    expect(res.error, res.error?.message).to.be.undefined
    const parsed = JSON.parse(res.stdout.trim()) as {bean: string; branch: string; removed: boolean; workspace: string}
    expect(parsed).to.deep.equal({bean: 'hordr-1234', branch: 'bean/hordr-1234', removed: true, workspace: 'wP'})
  })

  it('no-op message when worktree_not_found', async () => {
    _setWtShell((args) => {
      calls.push(args)
      throw new HerdrError(
        `herdr worktree open failed: (stderr: ${JSON.stringify({error: {code: 'worktree_not_found', message: 'nope'}})})`,
      )
    })

    const res = await invoke(['hordr-9999'])

    expect(res.error, res.error?.message).to.be.undefined
    expect(res.stdout).to.match(/no worktree for hordr-9999/)
  })

  it('errors when bean id is missing', async () => {
    const res = await invoke([])
    expect(res.error).to.be.instanceOf(Error)
    expect(res.error!.oclif?.exit).to.equal(2)
  })
})
