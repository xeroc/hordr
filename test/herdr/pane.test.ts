/* eslint-disable camelcase -- pane_id/workspace_id mirror herdr JSON contract */
import {assert, expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  findAnyPane,
  findPane,
  HerdrError,
  paneLabel,
  runInPane,
  sendText,
  type ShellFn,
  splitPane,
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

  it('splitPane returns pane info', () => {
    responder = () => JSON.stringify({result: {pane: {pane_id: 'wX:p3', workspace_id: 'wX'}}})
    const info = splitPane({cwd: '/repo', direction: 'right', parentPaneId: 'wX:p1'})
    expect(info.pane_id).to.equal('wX:p3')
  })

  it('splitPane with label calls rename after split', () => {
    let renamed = false
    responder = (args) => {
      if (args[1] === 'split') return JSON.stringify({result: {pane: {pane_id: 'wX:pNEW'}}})
      if (args[1] === 'rename') renamed = true
      return ''
    }

    splitPane({direction: 'right', label: 'hordr:bean:impl', parentPaneId: 'wX:p1'})
    assert.isTrue(renamed, 'pane rename was called')
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

  it('runInPane builds pane run args', () => {
    runInPane('wJ:p2', 'echo hi')
    expect(calls[0]).to.deep.equal(['pane', 'run', 'wJ:p2', 'echo hi'])
  })

  it('sendText builds pane send-text args', () => {
    sendText('wJ:p2', 'some text')
    expect(calls[0]).to.deep.equal(['pane', 'send-text', 'wJ:p2', 'some text'])
  })

  it('throws HerdrError on JSON error envelope', () => {
    responder = () => JSON.stringify({error: {code: 'bad', message: 'boom'}})
    expect(() => splitPane({direction: 'right', parentPaneId: 'x'})).to.throw(HerdrError)
  })
})
