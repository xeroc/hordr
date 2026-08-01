/* eslint-disable camelcase -- pane_id/workspace_id mirror herdr JSON contract */
import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  agentActiveInPane,
  createTab,
  HerdrError,
  notify,
  paneExists,
  paneLabel,
  runInPane,
  type ShellFn,
} from '../../src/herdr/pane.js'

let calls: string[][] = []
let responder: ((args: string[]) => string) | null = null
const mock: ShellFn = (args) => {
  calls.push(args)
  if (responder) return responder(args)
  return ''
}

function paneListResponse(panes: Array<Record<string, unknown>>): string {
  return JSON.stringify({id: 'cli:pane:list', result: {panes, type: 'pane_list'}})
}

describe('herdr/pane', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mock)
  })

  afterEach(() => _resetShell())

  it('paneLabel builds hordr:<bean-id>:<role>', () => {
    expect(paneLabel('hordr-1234', 'implementer')).to.equal('hordr:hordr-1234:implementer')
  })

  it('createTab returns root pane info', () => {
    responder = () => JSON.stringify({result: {root_pane: {pane_id: 'wX:p3', workspace_id: 'wX'}}})
    const info = createTab({cwd: '/repo', workspaceId: 'wX'})
    expect(info.pane_id).to.equal('wX:p3')
  })

  it('createTab with label passes --label', () => {
    responder = () => JSON.stringify({result: {root_pane: {pane_id: 'wX:p3'}}})
    createTab({cwd: '/repo', label: 'hordr:bean:impl', workspaceId: 'wX'})
    expect(calls[0]).to.include('--label', 'hordr:bean:impl')
  })

  it('runInPane sends pane run args', () => {
    runInPane('wJ:p2', 'echo hi')
    expect(calls[0]).to.deep.equal(['pane', 'run', 'wJ:p2', 'echo hi'])
  })

  it('throws HerdrError on JSON error envelope', () => {
    responder = () => JSON.stringify({error: {code: 'bad', message: 'boom'}})
    expect(() => createTab({cwd: '/', workspaceId: 'x'})).to.throw(HerdrError)
  })

  // --- paneExists ---

  describe('paneExists', () => {
    it('returns true when pane is in the list', () => {
      responder = () => paneListResponse([{pane_id: 'w1:p1'}, {pane_id: 'w1:p2'}])
      expect(paneExists('w1:p1')).to.be.true
    })

    it('returns false when pane is NOT in the list', () => {
      responder = () => paneListResponse([{pane_id: 'w1:p1'}])
      expect(paneExists('w9:p9')).to.be.false
    })

    it('returns false when herdr errors (broken API must not mask dead agent)', () => {
      responder = () => {
        throw new Error('herdr unreachable')
      }

      expect(paneExists('w1:p1')).to.be.false
    })

    it('returns false for empty pane list', () => {
      responder = () => paneListResponse([])
      expect(paneExists('w1:p1')).to.be.false
    })

    it('parses herdr result wrapper (data.result.panes, not data.panes)', () => {
      responder = () => paneListResponse([{pane_id: 'w1:p1'}])
      expect(paneExists('w1:p1')).to.be.true
    })
  })

  // --- agentActiveInPane ---

  describe('agentActiveInPane', () => {
    it('returns true when pane has an agent registered', () => {
      responder = () => paneListResponse([{agent: 'opencode', agent_status: 'working', pane_id: 'w1:p1'}])
      expect(agentActiveInPane('w1:p1')).to.be.true
    })

    it('returns false when pane exists but no agent (agent_status: unknown)', () => {
      responder = () => paneListResponse([{agent_status: 'unknown', pane_id: 'w1:p1'}])
      expect(agentActiveInPane('w1:p1')).to.be.false
    })

    it('returns false when pane does not exist', () => {
      responder = () => paneListResponse([{agent: 'opencode', pane_id: 'w1:p1'}])
      expect(agentActiveInPane('w9:p9')).to.be.false
    })

    it('returns false when herdr errors', () => {
      responder = () => {
        throw new Error('herdr unreachable')
      }

      expect(agentActiveInPane('w1:p1')).to.be.false
    })

    it('distinguishes agent-present from agent-absent in the same list', () => {
      responder = () =>
        paneListResponse([
          {agent_status: 'unknown', pane_id: 'w1:p1'},
          {agent: 'opencode', agent_status: 'working', pane_id: 'w1:p2'},
        ])
      expect(agentActiveInPane('w1:p1')).to.be.false
      expect(agentActiveInPane('w1:p2')).to.be.true
    })
  })

  describe('notify', () => {
    it('builds `notification show` with body + sound', () => {
      responder = () => '{"result":{"shown":true}}'
      notify({body: 'into ms-1', sound: 'done', title: 'epic-1 merged'})
      expect(calls[0]).to.deep.equal([
        'notification',
        'show',
        'epic-1 merged',
        '--body',
        'into ms-1',
        '--sound',
        'done',
      ])
    })

    it('omits --body and --sound when not given', () => {
      responder = () => '{}'
      notify({title: 'hi'})
      expect(calls[0]).to.deep.equal(['notification', 'show', 'hi'])
    })

    it('swallows herdr errors (best-effort, never throws)', () => {
      responder = () => {
        throw new Error('no foreground client')
      }

      expect(() => notify({title: 'x'})).to.not.throw()
    })
  })
})
