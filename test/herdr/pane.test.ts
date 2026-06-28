/* eslint-disable camelcase -- pane_id/workspace_id mirror herdr JSON contract */
import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  createTab,
  findAnyPane,
  findPane,
  HerdrError,
  paneLabel,
  runInPane,
  sendEnter,
  sendText,
  type ShellFn,
} from '../../src/herdr/pane.js'

let calls: string[][] = []
let responder: ((args: string[]) => string) | null = null
const mock: ShellFn = (args) => {
  calls.push(args)
  if (responder) return responder(args)
  return ''
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
    responder = (args) => {
      if (args[0] === 'tab' && args[1] === 'create')
        return JSON.stringify({result: {root_pane: {pane_id: 'wX:p3', workspace_id: 'wX'}}})
      return ''
    }

    const info = createTab({cwd: '/repo', workspaceId: 'wX'})
    expect(info.pane_id).to.equal('wX:p3')
  })

  it('createTab with label passes --label', () => {
    responder = () => JSON.stringify({result: {root_pane: {pane_id: 'wX:p3'}}})
    createTab({cwd: '/repo', label: 'hordr:bean:impl', workspaceId: 'wX'})
    expect(calls[0]).to.include('--label', 'hordr:bean:impl')
  })

  it('findPane alive returns pane info', () => {
    responder = () => JSON.stringify({result: {pane: {pane_id: 'wJ:p2', workspace_id: 'wJ'}}})
    expect(findPane('wJ:p2')?.pane_id).to.equal('wJ:p2')
  })

  it('findPane gone returns null', () => {
    responder = () => JSON.stringify({error: {code: 'pane_not_found'}})
    expect(findPane('wJ:p99')).to.be.null
  })

  it('findAnyPane returns first pane id', () => {
    responder = () => JSON.stringify({result: {panes: [{pane_id: 'wJ:p1'}]}})
    expect(findAnyPane()).to.equal('wJ:p1')
  })

  it('runInPane sends pane run args', () => {
    runInPane('wJ:p2', 'echo hi')
    expect(calls[0]).to.deep.equal(['pane', 'run', 'wJ:p2', 'echo hi'])
  })

  it('sendText sends pane send-text args', () => {
    sendText('wJ:p2', 'some text')
    expect(calls[0]).to.deep.equal(['pane', 'send-text', 'wJ:p2', 'some text'])
  })

  it('sendEnter sends pane send-keys Enter', () => {
    sendEnter('wJ:p2')
    expect(calls[0]).to.deep.equal(['pane', 'send-keys', 'wJ:p2', 'Enter'])
  })

  it('throws HerdrError on JSON error envelope', () => {
    responder = () => JSON.stringify({error: {code: 'bad', message: 'boom'}})
    expect(() => createTab({cwd: '/', workspaceId: 'x'})).to.throw(HerdrError)
  })
})
