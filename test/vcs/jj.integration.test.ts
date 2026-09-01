import {expect} from 'chai'
/**
 * Integration test for the jj Vcs adapter — exercises a REAL colocated jj
 * repo in a /tmp scratch dir. Self-skips when jj is absent. Real herdr is NOT
 * required: the herdr adoption is faked via createJjVcs({herdrCreate}).
 *
 * The tests are an ordered flow (mocha runs `it` in declaration order):
 * init → createWorkspace → dirtyPaths → integrateHead clean → conflicting
 * merge → conflictedFiles → resolve → settle → finalize → mergeHeadIntoRef →
 * projectKey → commitPending → deleteRef → removeWorkspace.
 */
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {createJjVcs} from '../../src/vcs/jj-vcs.js'

const jjExists = (() => {
  try {
    execFileSync('jj', ['--version'], {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
})()

/** Raw jj with the adapter's global flags + the same stale-copy recovery. */
function jj(args: string[], cwd: string): string {
  try {
    return execFileSync('jj', ['--no-pager', '--color=never', ...args], {cwd, encoding: 'utf8'})
  } catch (error) {
    const e = error as {message?: string; stderr?: {toString(): string}}
    if (!/working copy is stale/i.test(`${e.message ?? ''} ${e.stderr?.toString() ?? ''}`)) throw error
    execFileSync('jj', ['--no-pager', '--color=never', 'workspace', 'update-stale'], {cwd, encoding: 'utf8'})
    return execFileSync('jj', ['--no-pager', '--color=never', ...args], {cwd, encoding: 'utf8'})
  }
}

describe('vcs/jj integration (real jj)', () => {
  let root = ''
  let repo = ''
  // herdr-free adoption: every created workspace reports the same fake id.
  const vcs = createJjVcs({herdrCreate: () => ({workspaceId: 'wIT'})})
  let laneA = {path: '', workspaceId: 'wIT'}

  // Self-skip when jj is absent (CI without jj): skip from before() so the
  // hooks stay statically inside this suite.
  before(function () {
    if (!jjExists) this.skip()

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hordr-jj-it-'))
    repo = path.join(root, 'repo')
    fs.mkdirSync(repo)
    jj(['git', 'init', '--colocate'], repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'initial\n')
    jj(['commit', '-m', 'initial'], repo)
  })

  after(() => {
    if (root) fs.rmSync(root, {force: true, recursive: true})
  })

  it('createWorkspace creates a sibling workspace based on a workspace head', () => {
    laneA = vcs.createWorkspace({base: 'default', cwd: repo, name: 'laneA'})

    expect(laneA.path).to.equal(path.join(root, 'laneA'))
    expect(laneA.workspaceId).to.equal('wIT')
    expect(fs.readFileSync(path.join(laneA.path, 'a.txt'), 'utf8')).to.equal('initial\n')
    expect(jj(['workspace', 'list'], repo)).to.include('laneA')
  })

  it('createWorkspace is idempotent (reuses the existing workspace)', () => {
    const again = vcs.createWorkspace({base: 'default', cwd: repo, name: 'laneA'})

    expect(again.path).to.equal(laneA.path)
  })

  it('findWorkspace locates a lane and returns null for unknown names', () => {
    expect(vcs.findWorkspace({cwd: repo, name: 'laneA'})).to.deep.equal({path: path.join(root, 'laneA')})
    expect(vcs.findWorkspace({cwd: repo, name: 'nope'})).to.be.null
  })

  it('dirtyPaths sees in-flight edits (snapshot semantics), [] once committed', () => {
    fs.writeFileSync(path.join(laneA.path, 'a.txt'), 'laneA\n')
    expect(vcs.dirtyPaths(laneA.path)).to.deep.equal(['a.txt'])

    jj(['commit', '-m', 'laneA edit'], laneA.path)
    expect(vcs.dirtyPaths(laneA.path)).to.deep.equal([])
  })

  it('integrateHead merges an untouched lane cleanly', () => {
    const result = vcs.integrateHead({cwd: repo, message: 'merge laneA', source: 'laneA', target: 'ms'})

    expect(result).to.deep.equal({status: 'merged'})
    expect(vcs.conflictedFiles(repo)).to.deep.equal([])
  })

  it('integrateHead conflicts when both sides edited the same file', () => {
    const laneB = vcs.createWorkspace({base: 'default', cwd: repo, name: 'laneB'})
    fs.writeFileSync(path.join(laneB.path, 'a.txt'), 'laneB\n')
    jj(['commit', '-m', 'laneB edit'], laneB.path)
    // The integration line must also touch a.txt after laneB branched.
    fs.writeFileSync(path.join(repo, 'a.txt'), 'main edit\n')
    expect(vcs.dirtyPaths(repo)).to.deep.equal(['a.txt'])

    const result = vcs.integrateHead({cwd: repo, message: 'merge laneB', source: 'laneB', target: 'ms'})

    expect(result).to.deep.equal({status: 'conflict'})
  })

  it('conflictedFiles lists the conflicted path; integration is not settled', () => {
    expect(vcs.conflictedFiles(repo)).to.deep.equal(['a.txt'])
    expect(vcs.isIntegrationSettled({cwd: repo, source: 'laneB', target: 'ms'})).to.be.false
  })

  it('resolving the file (merger agent) settles the integration', () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'resolved\n')
    jj(['st'], repo) // snapshot the resolution into @

    expect(vcs.conflictedFiles(repo)).to.deep.equal([])
    expect(vcs.isIntegrationSettled({cwd: repo, source: 'laneB', target: 'ms'})).to.be.true
  })

  it('finalizeIntegration moves the target bookmark to the resolved merge', () => {
    vcs.finalizeIntegration({cwd: repo, target: 'ms'})

    expect(jj(['log', '-r', 'ms', '--no-graph', '-T', 'description'], repo)).to.include('merge laneB')
    expect(vcs.dirtyPaths(repo)).to.deep.equal([]) // parked on an empty head
  })

  it('mergeHeadIntoRef merges a lane head into the bookmark and moves it forward', () => {
    fs.writeFileSync(path.join(root, 'laneB', 'b.txt'), 'laneB extra\n')
    jj(['commit', '-m', 'laneB extra'], path.join(root, 'laneB'))

    const result = vcs.mergeHeadIntoRef({
      cwd: path.join(root, 'laneB'),
      message: 'laneB into ms',
      ref: 'ms',
      source: 'laneB',
    })

    expect(result).to.deep.equal({status: 'merged'})
    expect(jj(['log', '-r', 'ms', '--no-graph', '-T', 'description'], repo)).to.include('laneB into ms')
  })

  it('projectKey is stable across workspaces (the shared .git)', () => {
    expect(vcs.projectKey(laneA.path)).to.equal(vcs.projectKey(repo))
    expect(vcs.projectKey(repo)).to.match(/\.git$/)
  })

  it('commitPending commits an undescribed head once, then is a no-op (idempotent)', () => {
    expect(vcs.commitPending({cwd: repo, message: 'chore(beans): rollup'})).to.be.false // @ is the parked empty head

    fs.writeFileSync(path.join(repo, 'beans.status'), 'x\n')
    expect(vcs.commitPending({cwd: repo, message: 'chore(beans): rollup'})).to.be.true
    expect(vcs.commitPending({cwd: repo, message: 'chore(beans): rollup'})).to.be.false // empty again
  })

  it('deleteRef removes the bookmark and tolerates absence', () => {
    vcs.deleteRef({cwd: repo, name: 'ms'})
    expect(() => jj(['log', '-r', 'ms'], repo)).to.throw()

    expect(() => vcs.deleteRef({cwd: repo, name: 'ms'})).to.not.throw()
  })

  it('removeWorkspace forgets the workspace and deletes the directory (idempotent)', () => {
    vcs.removeWorkspace({cwd: repo, name: 'laneA', path: laneA.path})

    expect(fs.existsSync(laneA.path)).to.be.false
    expect(jj(['workspace', 'list'], repo)).to.not.include('laneA')
    expect(() => vcs.removeWorkspace({cwd: repo, name: 'laneA', path: laneA.path})).to.not.throw()
  })
})
