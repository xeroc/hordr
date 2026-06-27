import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  HerdrWaitTimeout,
  type ShellFn,
  waitAgentStatus,
} from '../../src/herdr/wait.js'

let calls: string[][] = []
let responder: ((args: string[]) => string) | null = null
const mockShell: ShellFn = (args) => {
  calls.push(args)
  if (responder) return responder(args)
  throw new Error(`unexpected shell call: herdr ${args.join(' ')}`)
}

describe('herdr/wait', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mockShell)
  })

  afterEach(() => _resetShell())

  it('waitAgentStatus returns void on a success JSON result', () => {
    responder = () => JSON.stringify({id: 'cli:wait:agent-status', result: {status: 'done', type: 'status_reached'}})
    expect(waitAgentStatus({paneId: 'p', status: 'done', timeoutMs: 500})).to.equal(undefined)
  })

  it('waitAgentStatus throws HerdrWaitTimeout (with pane id) on timeout', () => {
    responder = () => JSON.stringify({error: {code: 'timeout', message: 'no status within 500ms'}})
    expect(() => waitAgentStatus({paneId: 'wJ:p4', status: 'done', timeoutMs: 500})).to.throw(HerdrWaitTimeout, /wJ:p4/)
  })

  it('waitAgentStatus builds correct args', () => {
    responder = () => JSON.stringify({result: {status: 'done'}})
    waitAgentStatus({paneId: 'wJ:p2', status: 'done', timeoutMs: 5000})
    expect(calls[0]).to.deep.equal(['wait', 'agent-status', 'wJ:p2', '--status', 'done', '--timeout', '5000'])
  })
})
