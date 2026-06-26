/* eslint-disable camelcase -- pane_id/tab_id/workspace_id mirror herdr's JSON contract */
import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  closePane,
  findPane,
  HerdrError,
  paneLabel,
  readPane,
  renamePane,
  runInPane,
  sendText,
  type ShellFn,
  splitLabeled,
  splitPane,
} from '../../src/herdr/pane.js'

interface Call {
  args: string[]
  opts?: {cwd?: string}
}

let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (args, opts?) => {
  const c: Call = {args, opts}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected shell call: herdr ${args.join(' ')}`)
}

const SPLIT_JSON = JSON.stringify({
  id: 'cli:pane:split',
  result: {pane: {cwd: '/repo', pane_id: 'wJ:p3', tab_id: 'wJ:t2', workspace_id: 'wJ'}, type: 'pane_split'},
})

describe('herdr/pane', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mockShell)
  })

  afterEach(() => {
    _resetShell()
  })

  it('paneLabel builds hordr:<bean-id>:<role>', () => {
    expect(paneLabel('hordr-1234', 'implementer')).to.equal('hordr:hordr-1234:implementer')
  })

  it('splitPane happy path returns pane info (AC #1)', () => {
    responder = () => SPLIT_JSON
    const info = splitPane({direction: 'right', parentPaneId: 'wJ:p2'})
    expect(info.pane_id).to.equal('wJ:p3')
    expect(info.workspace_id).to.equal('wJ')
    expect(info.tab_id).to.equal('wJ:t2')
  })

  it('splitPane builds correct args with --pane and --cwd', () => {
    responder = () => SPLIT_JSON
    splitPane({cwd: '/repo', direction: 'right', parentPaneId: 'wJ:p2'})
    expect(calls[0].args).to.deep.equal([
      'pane',
      'split',
      '--json',
      '--direction',
      'right',
      '--pane',
      'wJ:p2',
      '--cwd',
      '/repo',
    ])
  })

  it('splitPane with label calls rename after split (AC #1)', () => {
    responder = (c) => (c.args[1] === 'split' ? SPLIT_JSON : '')
    const info = splitPane({direction: 'right', label: 'hordr:1:impl', parentPaneId: 'wJ:p2'})
    expect(info.pane_id).to.equal('wJ:p3')
    expect(calls).to.have.lengthOf(2)
    expect(calls[1].args).to.deep.equal(['pane', 'rename', 'wJ:p3', 'hordr:1:impl'])
  })

  it('splitPane requires parentPaneId', () => {
    // any: intentionally omitting a required field to test runtime validation
    expect(() => splitPane({direction: 'right'} as unknown as Parameters<typeof splitPane>[0])).to.throw(
      HerdrError,
      /parentPaneId/,
    )
  })

  it('splitPane error from herdr throws HerdrError', () => {
    responder = () => JSON.stringify({error: {code: 'x', message: 'y'}})
    expect(() => splitPane({direction: 'right', parentPaneId: 'wJ:p2'})).to.throw(HerdrError, /pane split failed/)
  })

  it('renamePane happy path builds pane rename args', () => {
    responder = () => ''
    renamePane('wJ:p2', 'my-label')
    expect(calls[0].args).to.deep.equal(['pane', 'rename', 'wJ:p2', 'my-label'])
  })

  it('renamePane rejects empty inputs', () => {
    expect(() => renamePane('', 'x')).to.throw(HerdrError, /paneId/)
    expect(() => renamePane('wJ:p2', '')).to.throw(HerdrError, /label/)
  })

  it('splitLabeled happy path splits + renames', () => {
    responder = (c) => (c.args[1] === 'split' ? SPLIT_JSON : '')
    const info = splitLabeled({label: 'hordr:9:agent', parentPaneId: 'wJ:p2'})
    expect(info.pane_id).to.equal('wJ:p3')
    expect(calls[1].args).to.deep.equal(['pane', 'rename', 'wJ:p3', 'hordr:9:agent'])
  })

  it('splitLabeled defaults direction to right', () => {
    responder = (c) => (c.args[1] === 'split' ? SPLIT_JSON : '')
    splitLabeled({label: 'x', parentPaneId: 'wJ:p2'})
    expect(calls[0].args).to.include('--direction')
    expect(calls[0].args[calls[0].args.indexOf('--direction') + 1]).to.equal('right')
  })

  it('findPane alive returns pane info', () => {
    responder = () =>
      JSON.stringify({
        id: 'cli:pane:get',
        result: {pane: {cwd: '/repo', pane_id: 'wJ:p2', workspace_id: 'wJ'}, type: 'pane_info'},
      })
    const info = findPane('wJ', 'wJ:p2')
    expect(info).to.not.be.null
    expect(info?.pane_id).to.equal('wJ:p2')
    expect(info?.workspace_id).to.equal('wJ')
  })

  it('findPane returns null on pane_not_found (AC #2/#3)', () => {
    responder = () =>
      JSON.stringify({error: {code: 'pane_not_found', message: 'pane wJ:p99 not found'}, id: 'cli:pane:get'})
    expect(findPane('wJ', 'wJ:p99')).to.be.null
  })

  it('findPane throws HerdrError on other error codes', () => {
    responder = () => JSON.stringify({error: {code: 'server_error', message: 'boom'}})
    expect(() => findPane('wJ', 'wJ:p2')).to.throw(HerdrError, /pane get failed/)
  })

  it('runInPane builds pane run args (AC #4)', () => {
    responder = () => ''
    runInPane('wJ:p2', 'echo hi')
    expect(calls[0].args).to.deep.equal(['pane', 'run', 'wJ:p2', 'echo hi'])
  })

  it('sendText builds pane send-text args', () => {
    responder = () => ''
    sendText('wJ:p2', 'some text')
    expect(calls[0].args).to.deep.equal(['pane', 'send-text', 'wJ:p2', 'some text'])
  })

  it('readPane unwraps JSON RPC output', () => {
    responder = () => JSON.stringify({id: 'cli:pane:read', result: {text: 'line1\nline2'}})
    expect(readPane({paneId: 'wJ:p2'})).to.equal('line1\nline2')
  })

  it('readPane passes through plain text', () => {
    responder = () => 'plain text\n'
    expect(readPane({paneId: 'wJ:p2'})).to.equal('plain text\n')
  })

  it('readPane applies defaults source/lines/format', () => {
    responder = () => 'ok'
    readPane({paneId: 'wJ:p2'})
    expect(calls[0].args).to.deep.equal([
      'pane',
      'read',
      'wJ:p2',
      '--source',
      'recent',
      '--lines',
      '200',
      '--format',
      'text',
    ])
  })

  it('closePane builds pane close args', () => {
    responder = () => ''
    closePane('wJ:p2')
    expect(calls[0].args).to.deep.equal(['pane', 'close', 'wJ:p2'])
  })
})
