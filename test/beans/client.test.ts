/* eslint-disable camelcase -- SAMPLE_BEAN mirrors the on-disk beans JSON contract */
import {assert, expect} from 'chai'

import {
  _resetShell,
  _setBeansPresentForTesting,
  _setShellForTesting,
  BeansError,
  type BeanStatus,
  getBean,
  getBody,
  getStatus,
  getWorkflow,
  setStatus,
  setWorkflow,
  type ShellFn,
  type ShellOptions,
} from '../../src/beans/client.js'

interface Call {
  args: string[]
  cmd: string
}

const SAMPLE_BODY = '## Requirement\n\nDo the thing.\n\n## Spec\n\nApproach.\n'
const SAMPLE_BEAN = {
  body: SAMPLE_BODY,
  created_at: '2026-06-26T00:00:00Z',
  etag: 'abc123',
  id: 'hordr-1001',
  path: 'hordr-1001--scaffold.md',
  priority: 'high',
  slug: 'scaffold',
  status: 'todo',
  title: 'Scaffold',
  type: 'epic',
  updated_at: '2026-06-26T00:00:00Z',
}
const SAMPLE_BEAN_JSON = JSON.stringify(SAMPLE_BEAN)

// Mock shell: records every invocation, delegates to a per-test responder.
// Default responder throws to surface unexpected calls loudly.
let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (cmd: string, args: string[], _opts: ShellOptions) => {
  const c: Call = {args, cmd}
  calls.push(c)
  if (responder) return responder(c)
  throw new Error(`unexpected shell call: ${cmd} ${args.join(' ')}`)
}

describe('beans/client', () => {
  beforeEach(() => {
    calls = []
    responder = null
    _setShellForTesting(mockShell)
    _setBeansPresentForTesting(true)
  })

  afterEach(() => {
    _resetShell()
    _setBeansPresentForTesting(true)
  })

  it('getBean returns a parsed bean record (AC #1)', () => {
    responder = () => SAMPLE_BEAN_JSON
    const bean = getBean('hordr-1001')
    expect(bean.id).to.equal('hordr-1001')
    expect(bean.status).to.equal('todo')
    expect(bean.title).to.equal('Scaffold')
    expect(bean.body).to.equal(SAMPLE_BODY)
    expect(bean.etag).to.equal('abc123')
  })

  it('getStatus returns one of the 5 valid statuses (AC #1)', () => {
    responder = () => SAMPLE_BEAN_JSON
    expect(getStatus('hordr-1001')).to.equal('todo')
  })

  it('getStatus throws BeansError when status is not in the closed set', () => {
    responder = () => JSON.stringify({...SAMPLE_BEAN, status: 'wat'})
    expect(() => getStatus('hordr-1001')).to.throw(BeansError, /invalid status/)
  })

  it('getBody returns the body string unchanged (AC #2)', () => {
    responder = () => SAMPLE_BEAN_JSON
    expect(getBody('hordr-1001')).to.equal(SAMPLE_BODY)
  })

  it('setStatus shells out with --status <s> and returns the new status (AC #3)', () => {
    responder = (c) => {
      if (c.args[0] === 'update') {
        expect(c.args).to.include('--status')
        expect(c.args).to.include('completed')
        return JSON.stringify({...SAMPLE_BEAN, status: 'completed'})
      }

      return SAMPLE_BEAN_JSON
    }

    expect(setStatus('hordr-1001', 'completed')).to.equal('completed')
  })

  it('setStatus rejects an invalid status before any shell call', () => {
    responder = () => {
      throw new Error('responder should not be invoked')
    }

    expect(() => setStatus('hordr-1001', 'wat' as BeanStatus)).to.throw()
    // ZodError fires before assertBeansOnPath/runBeans, so no beans calls recorded.
    assert.lengthOf(calls, 0)
  })

  it('setWorkflow appends the marker when absent (AC #4)', () => {
    responder = (c) => (c.args[0] === 'show' ? SAMPLE_BEAN_JSON : '{"ok":true}')
    setWorkflow('hordr-1001', 'implement')
    const updateCall = calls.find((c) => c.args[0] === 'update')
    assert.isOk(updateCall)
    expect(updateCall!.args).to.include('--body-append')
    expect(updateCall!.args).to.include('<!-- hordr:workflow=implement -->')
    expect(updateCall!.args).to.not.include('--body-replace-old')
  })

  it('setWorkflow replaces an existing marker via --body-replace-old/new (AC #4)', () => {
    const bodyWithMarker = `${SAMPLE_BODY}\n<!-- hordr:workflow=plan -->\n`
    responder = (c) => (c.args[0] === 'show' ? JSON.stringify({...SAMPLE_BEAN, body: bodyWithMarker}) : '{"ok":true}')
    setWorkflow('hordr-1001', 'implement')
    const updateCall = calls.find((c) => c.args[0] === 'update')
    assert.isOk(updateCall)
    const a = updateCall!.args
    expect(a).to.include('--body-replace-old')
    expect(a).to.include('<!-- hordr:workflow=plan -->')
    expect(a).to.include('--body-replace-new')
    expect(a).to.include('<!-- hordr:workflow=implement -->')
    expect(a).to.not.include('--body-append')
  })

  it('setWorkflow rejects an empty/whitespace workflow', () => {
    responder = () => SAMPLE_BEAN_JSON
    expect(() => setWorkflow('hordr-1001', '')).to.throw(BeansError, /whitespace-free/)
    expect(() => setWorkflow('hordr-1001', 'two words')).to.throw(BeansError, /whitespace-free/)
  })

  it('getWorkflow returns the captured value when the marker is present', () => {
    responder = () =>
      JSON.stringify({
        ...SAMPLE_BEAN,
        body: `${SAMPLE_BODY}\n<!-- hordr:workflow=implement -->\n`,
      })
    expect(getWorkflow('hordr-1001')).to.equal('implement')
  })

  it('getWorkflow returns null when the marker is absent', () => {
    responder = () => SAMPLE_BEAN_JSON
    expect(getWorkflow('hordr-1001')).to.equal(null)
  })

  it('fails loud with BeansError when beans is not on PATH (AC #5)', () => {
    _setBeansPresentForTesting(false)
    expect(() => getBean('hordr-1001')).to.throw(BeansError, /beans CLI not found on PATH/)
    assert.lengthOf(calls, 0)
  })

  it('wraps a non-zero beans exit as BeansError naming the bean id and stderr snippet', () => {
    const fakeExit = Object.assign(new Error('Command failed'), {
      status: 1,
      stderr: 'bean not found: hordr-9999',
    })
    responder = () => {
      throw fakeExit
    }

    expect(() => getBean('hordr-9999')).to.throw(BeansError, /hordr-9999/)
    expect(() => getBean('hordr-9999')).to.throw(BeansError, /bean not found/)
  })
})
