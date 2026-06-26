import {assert, expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  HerdrNotifyError,
  notify,
  type ShellFn,
  type ShellOptions,
} from '../../src/herdr/notify.js'

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
  // notification show prints nothing on success
  return ''
}

describe('herdr/notify', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mockShell)
  })

  afterEach(() => _resetShell())

  it('notify fires `notification show <title>`', () => {
    notify({title: 'Hello'})
    assert.lengthOf(calls, 1)
    const a = calls[0].args
    expect(a.slice(0, 3)).to.deep.equal(['notification', 'show', 'Hello'])
  })

  it('notify forwards --body when provided', () => {
    notify({body: 'the body', title: 'T'})
    expect(calls[0].args).to.include('--body')
    expect(calls[0].args).to.include('the body')
  })

  it('notify forwards --position and --sound when provided', () => {
    notify({position: 'top-right', sound: 'done', title: 'T'})
    const a = calls[0].args
    expect(a).to.include('--position')
    expect(a).to.include('top-right')
    expect(a).to.include('--sound')
    expect(a).to.include('done')
  })

  it('notify rejects an empty title before any shell call', () => {
    responder = () => {
      throw new Error('responder should not be invoked')
    }

    expect(() => notify({title: ''})).to.throw(HerdrNotifyError, /title/)
    assert.lengthOf(calls, 0)
  })

  it('notify treats empty stdout as success (no throw)', () => {
    responder = () => ''
    expect(() => notify({title: 'T'})).to.not.throw()
  })

  it('notify throws HerdrNotifyError when stdout is a JSON error shape', () => {
    responder = () => JSON.stringify({error: {code: 'rate_limited', message: 'too many'}})
    expect(() => notify({title: 'T'})).to.throw(HerdrNotifyError, /rate_limited/)
  })
})
