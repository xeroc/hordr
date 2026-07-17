/* eslint-disable camelcase -- SAMPLE_BEAN mirrors the on-disk beans JSON contract */
import {expect} from 'chai'

import {
  _resetShell,
  _setBeansPresentForTesting,
  _setShellForTesting,
  BeansError,
  getBean,
  getBody,
  markBeanCompleted,
  resetBeanToTodo,
  type ShellFn,
  type ShellOptions,
} from '../../src/beans/client.js'

interface Call {
  args: string[]
  cmd: string
  opts: ShellOptions
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

let calls: Call[] = []
let responder: ((c: Call) => string) | null = null
const mockShell: ShellFn = (cmd: string, args: string[], opts: ShellOptions) => {
  const c: Call = {args, cmd, opts}
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

  it('getBean returns a parsed bean record', () => {
    responder = () => SAMPLE_BEAN_JSON
    const bean = getBean('hordr-1001')
    expect(bean.id).to.equal('hordr-1001')
    expect(bean.title).to.equal('Scaffold')
    expect(bean.body).to.equal(SAMPLE_BODY)
    expect(bean.etag).to.equal('abc123')
  })

  it('getBean forwards opts.cwd to the shell (worktree-relative reads)', () => {
    responder = () => SAMPLE_BEAN_JSON
    getBean('hordr-1001', {cwd: '/wt/hordr-1001'})
    expect(calls).to.have.length(1)
    expect(calls[0]!.opts.cwd).to.equal('/wt/hordr-1001')
  })

  it('getBody returns the body string unchanged', () => {
    responder = () => SAMPLE_BEAN_JSON
    expect(getBody('hordr-1001')).to.equal(SAMPLE_BODY)
  })

  it('fails loud with BeansError when beans is not on PATH', () => {
    _setBeansPresentForTesting(false)
    expect(() => getBean('hordr-1001')).to.throw(BeansError, /beans CLI not found on PATH/)
    expect(calls).to.have.length(0)
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

  it('throws BeansError on non-JSON output', () => {
    responder = () => 'not json {{{'
    expect(() => getBean('hordr-1001')).to.throw(BeansError, /non-JSON/)
  })

  it('markBeanCompleted runs `beans update <id> -s completed` with the cwd (ADR-0011 rollup)', () => {
    responder = () => '' // beans update returns nothing on success
    markBeanCompleted('hordr-1001', {cwd: '/wt/hordr-1001'})
    expect(calls).to.have.length(1)
    expect(calls[0]!.cmd).to.match(/beans$/)
    expect(calls[0]!.args).to.deep.equal(['update', 'hordr-1001', '-s', 'completed'])
    expect(calls[0]!.opts.cwd).to.equal('/wt/hordr-1001')
  })

  it('markBeanCompleted wraps a non-zero exit as BeansError', () => {
    responder = () => {
      throw Object.assign(new Error('Command failed'), {stderr: 'no such bean'})
    }

    expect(() => markBeanCompleted('hordr-9999')).to.throw(BeansError, /hordr-9999/)
  })

  it('resetBeanToTodo runs `beans update <id> -s todo` with the cwd (crash recovery)', () => {
    responder = () => ''
    resetBeanToTodo('hordr-1001', {cwd: '/wt/hordr-1001'})
    expect(calls).to.have.length(1)
    expect(calls[0]!.args).to.deep.equal(['update', 'hordr-1001', '-s', 'todo'])
    expect(calls[0]!.opts.cwd).to.equal('/wt/hordr-1001')
  })

  it('resetBeanToTodo wraps a non-zero exit as BeansError', () => {
    responder = () => {
      throw Object.assign(new Error('Command failed'), {stderr: 'no such bean'})
    }

    expect(() => resetBeanToTodo('hordr-9999')).to.throw(BeansError, /hordr-9999/)
  })
})
