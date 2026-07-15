/* eslint-disable camelcase -- SAMPLE_BEAN mirrors the on-disk beans JSON contract (status, pane_id, workspace_id) */
import {assert, expect} from 'chai'

import {
  _resetShell as _resetBeansShell,
  _setBeansPresentForTesting,
  _setShellForTesting as _setBeansShell,
  type ShellFn,
  type ShellOptions,
} from '../../src/beans/client.js'
import {
  _resetShell as _resetDispatchShell,
  _setShellForTesting as _setDispatchShell,
} from '../../src/dispatch/dispatch.js'
import {
  _resetWhich,
  _setWhichForTesting,
  buildHarnessCommand,
  buildPrompt,
  HarnessError,
  launchAgent,
  resolveHarness,
} from '../../src/harness/launcher.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../src/herdr/pane.js'

// minimal HordrConfig shape (only fields touched by these units)
const PERSONA = 'You are the implementer. Do the thing.\n'
const makeConfig = (agents: Record<string, unknown> = {}) =>
  ({
    agents: {
      implementer: {harness: 'opencode', persona: PERSONA},
      ...agents,
    },
    concurrency: 3,
    primary_branch: 'develop',
    routing: {default_workflow: 'implement'},
    workflows: {},
  }) as Parameters<typeof resolveHarness>[1]

// Track every herdr-pane invocation: {cmd: [...subcommand], args: [...rest]}
interface HerdrCall {
  args: string[]
}
let paneCalls: HerdrCall[] = []
let paneResponder: ((c: HerdrCall) => string) | null = null

const mockPane = (args: string[]): string => {
  paneCalls.push({args})
  if (paneResponder) return paneResponder({args})
  if (args[0] === 'tab' && args[1] === 'create') {
    return JSON.stringify({result: {root_pane: {pane_id: 'wX:pNEW', workspace_id: 'wX'}}})
  }

  return ''
}

// beans CLI mock (getBean inside buildPrompt/launchAgent)
interface BeansCall {
  args: string[]
  cmd: string
}
let beansCalls: BeansCall[] = []
let beansResponder: ((c: BeansCall) => string) | null = null
const mockBeans: ShellFn = (cmd, args, _opts: ShellOptions) => {
  const c: BeansCall = {args, cmd}
  beansCalls.push(c)
  if (beansResponder) return beansResponder(c)
  throw new Error(`unexpected beans call: ${cmd} ${args.join(' ')}`)
}

const FULL_BODY = `## Requirement

Build the thing.

## Spec

Approach.

## Acceptance Criteria

- [ ] It works
- [ ] It is fast
`
const SAMPLE_BEAN = {
  body: FULL_BODY,
  created_at: '2026-06-26T00:00:00Z',
  etag: 'e1',
  id: 'hordr-1501',
  path: 'hordr-1501.md',
  priority: 'high',
  slug: 'harness',
  status: 'in-progress',
  title: 'Harness resolution + persona injection',
  type: 'task',
  updated_at: '2026-06-26T00:00:00Z',
}

describe('harness/launcher', () => {
  beforeEach(() => {
    paneCalls = []
    paneResponder = null
    beansCalls = []
    beansResponder = null
    _setPaneShell(mockPane)
    _setBeansShell(mockBeans)
    _setBeansPresentForTesting(true)
    _setDispatchShell(() => JSON.stringify({bean: {parent: null}}))
  })

  afterEach(() => {
    _resetPaneShell()
    _resetWhich()
    _resetBeansShell()
    _resetDispatchShell()
    _setBeansPresentForTesting(true)
  })

  // --- hordr-1501 ---

  describe('resolveHarness', () => {
    it('returns the binary name when role is configured and binary is on PATH', () => {
      _setWhichForTesting(() => true)
      expect(resolveHarness('implementer', makeConfig())).to.equal('opencode')
    })

    it('throws HarnessError for an unknown role', () => {
      _setWhichForTesting(() => true)
      expect(() => resolveHarness('nope', makeConfig())).to.throw(HarnessError, /no agent configured for role 'nope'/)
    })

    it('throws HarnessError with exact AC message when the binary is not on PATH', () => {
      _setWhichForTesting(() => false)
      expect(() => resolveHarness('implementer', makeConfig())).to.throw(HarnessError, "harness 'opencode' not on PATH")
    })
  })

  describe('buildPrompt', () => {
    it('contains persona + bean id + bean body (no daemon wiring — hordr-zn3f)', () => {
      const prompt = buildPrompt('implementer', makeConfig(), 'hordr-1501', FULL_BODY)
      expect(prompt).to.contain(PERSONA)
      expect(prompt).to.contain('hordr-1501')
      expect(prompt).to.contain(FULL_BODY) // bean body inlined
      // No daemon remnants
      expect(prompt).to.not.contain('curl')
      expect(prompt).to.not.contain('--unix-socket')
      expect(prompt).to.not.contain('/complete')
    })

    it('renders ancestor chain as context when provided', () => {
      const prompt = buildPrompt('implementer', makeConfig(), 'task-1', 'Task body', [
        {body: 'Epic body', id: 'ep-1', title: 'My Epic', type: 'epic'},
      ])
      expect(prompt).to.contain('Epic body')
      expect(prompt).to.contain('My Epic')
      expect(prompt).to.contain('Task body')
      // Ancestor before leaf
      expect(prompt.indexOf('Epic body')).to.be.lessThan(prompt.indexOf('Task body'))
    })
  })

  describe('buildHarnessCommand', () => {
    it('opencode: run --interactive with shell-quoted prompt', () => {
      const cmd = buildHarnessCommand('opencode', 'do the thing')
      expect(cmd).to.equal("opencode run --interactive 'do the thing'")
    })

    it('omp: includes @AGENTS.md (omp does not auto-load it)', () => {
      const cmd = buildHarnessCommand('omp', 'do the thing')
      expect(cmd).to.equal("omp @AGENTS.md 'do the thing'")
    })

    it('unknown harness defaults to run --interactive (backward compat)', () => {
      const cmd = buildHarnessCommand('claude', 'review it')
      expect(cmd).to.equal("claude run --interactive 'review it'")
    })
  })

  describe('launchAgent', () => {
    it('creates a tab and runs harness with the prompt in one shot', () => {
      _setWhichForTesting(() => true)
      beansResponder = () => JSON.stringify(SAMPLE_BEAN)
      paneResponder = (c) => {
        if (c.args[0] === 'tab' && c.args[1] === 'create')
          return JSON.stringify({result: {root_pane: {pane_id: 'wX:pNEW', workspace_id: 'wX'}}})
        return ''
      }

      const result = launchAgent({
        beanId: 'hordr-1501',
        cwd: '/repo/wt/bean-hordr-1501',
        role: 'implementer',
        workspaceId: 'wX',
      })

      // Returns the pane_id from the new tab.
      expect(result).to.deep.equal({paneLabel: 'wX:pNEW'})

      // 1. tab create called with workspace + cwd + label
      const tabCreate = paneCalls.find((c) => c.args[0] === 'tab' && c.args[1] === 'create')
      assert.ok(tabCreate, 'tab create was called')
      expect(tabCreate!.args).to.include('--workspace', 'wX')
      expect(tabCreate!.args).to.include('--cwd', '/repo/wt/bean-hordr-1501')
      expect(tabCreate!.args).to.include('--label', 'hordr:hordr-1501:implementer')

      // 2. single pane run call with "opencode run --interactive '<prompt>'"
      const run = paneCalls.find((c) => c.args[0] === 'pane' && c.args[1] === 'run')
      assert.ok(run, 'pane run was called')
      expect(run!.args).to.include('wX:pNEW')
      const cmd = run!.args.at(-1)!
      expect(cmd).to.contain('opencode run --interactive')
      expect(cmd).to.contain('hordr-1501')
    })

    it('returns the pane_id from the tab', () => {
      _setWhichForTesting(() => true)
      beansResponder = () => JSON.stringify(SAMPLE_BEAN)
      paneResponder = (c) => {
        if (c.args[0] === 'tab' && c.args[1] === 'create')
          return JSON.stringify({result: {root_pane: {pane_id: 'wX:pNEW'}}})
        return ''
      }

      const result = launchAgent({
        beanId: 'hordr-1501',
        cwd: '/repo',
        role: 'implementer',
        workspaceId: 'wX',
      })

      expect(result).to.deep.equal({paneLabel: 'wX:pNEW'})
    })
  })
})
