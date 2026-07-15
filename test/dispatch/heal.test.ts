import {expect} from 'chai'

import {checkInvocation, worktreeIsClean} from '../../src/dispatch/heal.js'

describe('dispatch/heal', () => {
  it('returns proceed when bean is completed AND worktree is clean (self-heal from forgot-to-signal)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'completed', paneAlive: () => true, worktreeClean: () => true},
    )
    expect(result.action).to.equal('proceed')
  })

  it('returns wait when bean is completed BUT worktree is dirty (uncommitted changes)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'completed', paneAlive: () => true, worktreeClean: () => false},
    )
    expect(result.action).to.equal('wait')
    expect(result.reason).to.match(/dirty|uncommitted/i)
  })

  it('returns proceed when bean is completed AND worktree clean even if pane is gone (done then exited)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'completed', paneAlive: () => false, worktreeClean: () => true},
    )
    expect(result.action).to.equal('proceed')
  })

  it('returns wait when bean is completed, worktree dirty, AND pane is gone (do NOT proceed on dirty)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'completed', paneAlive: () => false, worktreeClean: () => false},
    )
    expect(result.action).to.equal('wait')
  })

  it('returns blocked when pane is gone and bean is not completed (crash)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'in-progress', paneAlive: () => false, worktreeClean: () => true},
    )
    expect(result.action).to.equal('blocked')
    expect(result.reason).to.match(/crash|gone/i)
  })

  it('returns wait when bean is not completed and pane is alive (still working)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'in-progress', paneAlive: () => true, worktreeClean: () => true},
    )
    expect(result.action).to.equal('wait')
  })

  it('never returns timeout (no wall-clock judgment)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234', worktreePath: '/wt/epic-1'},
      {beanStatus: () => 'todo', paneAlive: () => true, worktreeClean: () => true},
    )
    expect(result.action).to.not.equal('timeout')
  })

  // --- worktreeIsClean policy (beans-dir exclusion) ---

  describe('worktreeIsClean', () => {
    it('empty porcelain → clean', () => {
      expect(worktreeIsClean('', '.beans')).to.be.true
    })

    it('whitespace-only porcelain → clean', () => {
      expect(worktreeIsClean('  \n  ', '.beans')).to.be.true
    })

    it('dirty only in beans dir → clean (bean-status writes are expected)', () => {
      const porcelain = ' M .beans/hordr-1234--some-task.md\n M .beans/hordr-5678--other.md'
      expect(worktreeIsClean(porcelain, '.beans')).to.be.true
    })

    it('dirty with non-bean file → NOT clean', () => {
      const porcelain = ' M src/execute.ts\n M .beans/hordr-1234.md'
      expect(worktreeIsClean(porcelain, '.beans')).to.be.false
    })

    it('dirty with only non-bean file → NOT clean', () => {
      expect(worktreeIsClean(' M src/execute.ts', '.beans')).to.be.false
    })

    it('trailing slash on beans dir is handled', () => {
      expect(worktreeIsClean(' M .beans/foo.md', '.beans/')).to.be.true
    })

    it('does not false-match a similarly-prefixed dir', () => {
      // .beans-backup should NOT be treated as inside .beans
      expect(worktreeIsClean(' M .beans-backup/foo.md', '.beans')).to.be.false
    })

    it('handles renamed files (checks new path)', () => {
      const porcelain = 'R  .beans/old.md -> .beans/new.md'
      expect(worktreeIsClean(porcelain, '.beans')).to.be.true
    })

    it('handles renamed file landing outside beans dir', () => {
      const porcelain = 'R  .beans/old.md -> src/new.ts'
      expect(worktreeIsClean(porcelain, '.beans')).to.be.false
    })
  })
})
