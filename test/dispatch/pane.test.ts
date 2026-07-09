import {expect} from 'chai'

import {ensureLanePane} from '../../src/dispatch/pane.js'

describe('dispatch/pane ensureLanePane', () => {
  it('creates a pane on first dispatch and returns it', () => {
    let created: unknown
    const res = ensureLanePane(
      {epicId: 'epic-1', existingPaneId: null, workspaceId: 'w1', worktreePath: '/wt/epic-1'},
      {
        createPane(opts) {
          created = opts
          return 'w1:pNEW'
        },
      },
    )

    expect(res).to.deep.equal({created: true, paneId: 'w1:pNEW'})
    expect(created).to.deep.equal({cwd: '/wt/epic-1', label: 'hordr:epic-1', workspaceId: 'w1'})
  })

  it('reuses the existing pane on subsequent dispatches (no create call)', () => {
    let calls = 0
    const res = ensureLanePane(
      {epicId: 'epic-1', existingPaneId: 'w1:p1', workspaceId: 'w1', worktreePath: '/wt/epic-1'},
      {
        createPane() {
          calls++
          return 'should-not-happen'
        },
      },
    )

    expect(res).to.deep.equal({created: false, paneId: 'w1:p1'})
    expect(calls).to.equal(0)
  })

  it('treats an empty-string existingPaneId as absent (creates)', () => {
    const res = ensureLanePane(
      {epicId: 'epic-1', existingPaneId: '', workspaceId: 'w1', worktreePath: '/wt'},
      {createPane: () => 'w1:pNEW'},
    )
    expect(res.created).to.be.true
  })
})
