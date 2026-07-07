import {expect} from 'chai'

import {checkInvocation} from '../../src/dispatch/heal.js'

describe('dispatch/heal', () => {
  it('returns proceed when bean is completed (self-heal from forgot-to-signal)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234'},
      {beanStatus: () => 'completed', paneAlive: () => true},
    )
    expect(result.action).to.equal('proceed')
  })

  it('returns blocked when pane is gone and bean is not completed (crash)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234'},
      {beanStatus: () => 'in-progress', paneAlive: () => false},
    )
    expect(result.action).to.equal('blocked')
    expect(result.reason).to.match(/crash|gone/i)
  })

  it('returns wait when bean is not completed and pane is alive (still working)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234'},
      {beanStatus: () => 'in-progress', paneAlive: () => true},
    )
    expect(result.action).to.equal('wait')
  })

  it('returns proceed when bean is completed even if pane is gone (done then exited)', () => {
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234'},
      {beanStatus: () => 'completed', paneAlive: () => false},
    )
    expect(result.action).to.equal('proceed')
  })

  it('never returns timeout (no wall-clock judgment)', () => {
    // This test documents the no-timeout invariant from ADR-0010.
    // The function doesn't even accept a time parameter.
    const result = checkInvocation(
      {paneId: 'w1:p1', taskId: 'hordr-1234'},
      {beanStatus: () => 'todo', paneAlive: () => true},
    )
    expect(result.action).to.not.equal('timeout')
  })
})
