/* eslint-disable camelcase -- workspace_id is a SPEC.md §3 JSON field */
import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {StepConfig} from '../../../src/engine/steps/index.js'

import {commit} from '../../../src/engine/steps/commit.js'
import {StepError} from '../../../src/engine/steps/shared.js'
import {makeDeps, makeRun} from '../../engine/helpers.js'

const step = {kind: 'commit', optional: false} as StepConfig

describe('commit handler', () => {
  let gitDir: string

  beforeEach(() => {
    gitDir = mkdtempSync(path.join(os.tmpdir(), 'hordr-git-'))
    execFileSync('git', ['init', '--quiet'], {cwd: gitDir, stdio: 'pipe'})
    execFileSync('git', ['config', 'user.email', 'test@hordr.test'], {cwd: gitDir, stdio: 'pipe'})
    execFileSync('git', ['config', 'user.name', 'Hordr Test'], {cwd: gitDir, stdio: 'pipe'})
    writeFileSync(path.join(gitDir, 'file.txt'), 'content\n')
  })

  afterEach(() => {
    rmSync(gitDir, {force: true, recursive: true})
  })

  it('creates a commit with the trailer Refs: <bean> and returns done', () => {
    const run = makeRun({worktree: {branch: 'bean/hordr-test', workspace_id: gitDir}})

    const result = commit(run, step, makeDeps())

    expect(result.done).to.be.true
    const log = execFileSync('git', ['log', '--format=%B', '-1'], {cwd: gitDir, encoding: 'utf8'})
    expect(log).to.include('Refs: hordr-test')
  })

  it('idempotent: second call is a no-op when commit already exists', () => {
    const run = makeRun({worktree: {branch: 'bean/hordr-test', workspace_id: gitDir}})

    commit(run, step, makeDeps())
    commit(run, step, makeDeps())

    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {cwd: gitDir, encoding: 'utf8'})
    expect(count.trim()).to.equal('1')
  })

  it('throws StepError when no worktree in run state', () => {
    const run = makeRun({worktree: null})

    expect(() => commit(run, step, makeDeps())).to.throw(StepError, /no worktree/)
  })
})
