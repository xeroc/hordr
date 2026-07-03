/* eslint-disable camelcase -- pane_id/workspace_id mirror herdr JSON contract */
import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  createTab,
  HerdrError,
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
})
