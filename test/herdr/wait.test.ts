/* eslint-disable camelcase -- herdr wire JSON uses snake_case (pane_id), mirrored from the CLI surface */
import {assert, expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  HerdrError,
  HerdrWaitTimeout,
  type ShellFn,
  type ShellOptions,
  waitAgentStatus,
  type WaitAgentStatusOpts,
  waitOutput,
} from '../../src/herdr/wait.js'

interface Call {
  args: string[]
  opts?: ShellOptions
}

let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (args: string[], opts?: ShellOptions) => {
  const c: Call = {args, opts}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected shell call: herdr ${args.join(' ')}`)
}

// Module-scope (closes over the import only) so it stays out of test scope.
const fireTimeoutWait = (): string => waitOutput({match: 'x', paneId: 'wJ:p3', timeoutMs: 500})

describe('herdr/wait', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mockShell)
  })

  afterEach(() => _resetShell())

  it('waitOutput returns the matched text from a JSON result (.match)', () => {
    responder = () =>
      JSON.stringify({
        id: 'cli:wait:output',
        result: {match: 'BUILD GREEN', pane_id: 'wJ:p2', type: 'output_matched'},
      })
    expect(waitOutput({match: 'GREEN', paneId: 'wJ:p2', timeoutMs: 1000})).to.equal('BUILD GREEN')
  })

  it('waitOutput returns plain-text stdout as-is', () => {
    responder = () => 'some plain matched line\n'
    expect(waitOutput({match: 'x', paneId: 'p', timeoutMs: 500})).to.equal('some plain matched line')
  })

  it('waitOutput adds --regex when isRegex is true', () => {
    responder = () => JSON.stringify({result: {match: 'ok'}})
    waitOutput({isRegex: true, match: 'a.*b', paneId: 'p', timeoutMs: 500})
    expect(calls[0].args).to.include('--regex')
  })

  it('waitOutput throws HerdrWaitTimeout (with pane id) on a timeout error', () => {
    responder = () => JSON.stringify({error: {code: 'timeout', message: 'no match within 500ms'}})
    expect(fireTimeoutWait).to.throw(HerdrWaitTimeout, /wJ:p3/)
  })

  it('waitOutput wraps a non-timeout JSON error as HerdrError (not HerdrWaitTimeout)', () => {
    responder = () => JSON.stringify({error: {code: 'internal', message: 'boom'}})
    try {
      waitOutput({match: 'x', paneId: 'p1', timeoutMs: 500})
      assert.fail('expected waitOutput to throw')
    } catch (error) {
      const e = error as Error
      expect(e).to.be.instanceOf(HerdrError)
      expect(e).to.not.be.instanceOf(HerdrWaitTimeout)
      expect(e.message).to.match(/internal/)
      expect(e.message).to.match(/p1/)
    }
  })

  it('waitOutput validates timeoutMs > 0 before any shell call', () => {
    responder = () => {
      throw new Error('responder should not be invoked')
    }

    expect(() => waitOutput({match: 'x', paneId: 'p', timeoutMs: 0})).to.throw(HerdrError, /timeoutMs/)
    expect(() => waitOutput({match: 'x', paneId: 'p', timeoutMs: -1})).to.throw(HerdrError, /timeoutMs/)
    assert.lengthOf(calls, 0)
  })

  it('waitOutput defaults to --source recent --lines 200 and omits --regex', () => {
    responder = () => JSON.stringify({result: {match: 'ok'}})
    waitOutput({match: 'x', paneId: 'p', timeoutMs: 500})
    const a = calls[0].args
    expect(a).to.include('--source')
    expect(a).to.include('recent')
    expect(a).to.include('--lines')
    expect(a).to.include('200')
    expect(a).to.not.include('--regex')
  })

  it('waitAgentStatus returns void on a success JSON result', () => {
    responder = () => JSON.stringify({id: 'cli:wait:agent-status', result: {status: 'done', type: 'status_reached'}})
    expect(waitAgentStatus({paneId: 'p', status: 'done', timeoutMs: 500})).to.equal(undefined)
  })

  it('waitAgentStatus throws HerdrWaitTimeout (with pane id) on timeout', () => {
    responder = () => JSON.stringify({error: {code: 'timeout', message: 'no status within 500ms'}})
    expect(() => waitAgentStatus({paneId: 'wJ:p4', status: 'done', timeoutMs: 500})).to.throw(HerdrWaitTimeout, /wJ:p4/)
  })

  it('waitAgentStatus rejects an invalid status at runtime before any shell call', () => {
    responder = () => {
      throw new Error('responder should not be invoked')
    }

    const bad = {paneId: 'p', status: 'flying', timeoutMs: 500} as unknown as WaitAgentStatusOpts
    expect(() => waitAgentStatus(bad)).to.throw(HerdrError, /invalid status/)
    assert.lengthOf(calls, 0)
  })
})
