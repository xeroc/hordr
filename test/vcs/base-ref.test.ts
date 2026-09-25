import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {resolveMainCheckout} from '../../src/storage/project.js'
import {createGitVcs} from '../../src/vcs/git-vcs.js'
import {resolveBaseRef, VcsError} from '../../src/vcs/resolve.js'

/** Real throwaway git repo (the git adapter's read probes bypass the runner seam). */
function gitRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hordr-base-ref-'))
  execFileSync('git', ['init', '-b', 'develop', dir], {stdio: 'ignore'})
  writeFileSync(path.join(dir, 'a.txt'), 'a')
  execFileSync('git', ['add', '.'], {cwd: dir, stdio: 'ignore'})
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init'], {
    cwd: dir,
    stdio: 'ignore',
  })
  return dir
}

const git = createGitVcs()

describe('vcs base resolution (git)', () => {
  it('currentRef returns the checked-out branch', () => {
    const dir = gitRepo()
    try {
      expect(git.currentRef(dir)).to.equal('develop')
    } finally {
      rmSync(dir, {force: true, recursive: true})
    }
  })

  it('currentRef returns "" on detached HEAD and outside any repo', () => {
    const dir = gitRepo()
    try {
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: dir, encoding: 'utf8'}).trim()
      execFileSync('git', ['checkout', '--detach', sha], {cwd: dir, stdio: 'ignore'})
      expect(git.currentRef(dir)).to.equal('')
    } finally {
      rmSync(dir, {force: true, recursive: true})
    }

    const nowhere = mkdtempSync(path.join(os.tmpdir(), 'hordr-no-repo-'))
    try {
      expect(git.currentRef(nowhere)).to.equal('')
    } finally {
      rmSync(nowhere, {force: true, recursive: true})
    }
  })

  it('resolveBaseRef demands --base when no ref is standing (detached / not a repo)', () => {
    const nowhere = mkdtempSync(path.join(os.tmpdir(), 'hordr-no-repo-'))
    try {
      expect(() => resolveBaseRef(git, nowhere)).to.throw(VcsError, /--base <branch>/)
    } finally {
      rmSync(nowhere, {force: true, recursive: true})
    }

    const jjFake = {currentRef: () => '', kind: 'jj' as const}
    expect(() => resolveBaseRef(jjFake, '/w')).to.throw(VcsError, /--base <bookmark>/)
  })

  it('resolveMainCheckout maps a linked worktree back to the main checkout', () => {
    const main = gitRepo()
    const wt = path.join(path.dirname(main), `${path.basename(main)}-wt`)
    try {
      execFileSync('git', ['worktree', 'add', wt, '-b', 'feature'], {cwd: main, stdio: 'ignore'})
      expect(git.currentRef(wt)).to.equal('feature')
      expect(resolveMainCheckout({cwd: wt})).to.equal(main)
    } finally {
      rmSync(wt, {force: true, recursive: true})
      rmSync(main, {force: true, recursive: true})
    }
  })
})
