/* eslint-disable camelcase -- SAMPLE_BEAN mirrors the on-disk beans JSON contract (status, pane_id, workspace_id) */
import {assert, expect} from 'chai'

import type {PaneInfo} from '../../src/herdr/pane.js'

import {
  _resetShell as _resetBeansShell,
  _setBeansPresentForTesting,
  _setShellForTesting as _setBeansShell,
  type ShellFn,
  type ShellOptions,
} from '../../src/beans/client.js'
import {
  _resetListPanes,
  _resetWhich,
  _setListPanesForTesting,
  _setWhichForTesting,
  buildOpeningPrompt,
  HarnessError,
  launchAgent,
  resolveHarness,
} from '../../src/harness/launcher.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../src/herdr/pane.js'
import {_resetShell as _resetWaitShell, _setShellForTesting as _setWaitShell} from '../../src/herdr/wait.js'

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
    routing: {default_workflow: 'implement', plan_workflow: 'plan'},
    workflows: {},
    worktree_branch_prefix: 'bean/',
  }) as Parameters<typeof resolveHarness>[1]

// Track every herdr-pane invocation: {cmd: [...subcommand], args: [...rest]}
interface HerdrCall {
  args: string[]
}
let paneCalls: HerdrCall[] = []
let waitCalls: HerdrCall[] = []
let paneResponder: ((c: HerdrCall) => string) | null = null
let waitResponder: ((c: HerdrCall) => string) | null = null

const mockPane = (args: string[]): string => {
  paneCalls.push({args})
  if (paneResponder) return paneResponder({args})
  // default responders by subcommand
  if (args[0] === 'pane' && args[1] === 'split') {
    return JSON.stringify({
      id: 'cli:pane:split',
      result: {pane: {pane_id: 'wX:pNEW', workspace_id: 'wX'}, type: 'pane_split'},
    })
  }

  if (args[0] === 'pane' && args[1] === 'list') {
    return JSON.stringify({
      id: 'cli:pane:list',
      result: {panes: [{pane_id: 'wX:p1', workspace_id: 'wX'}], type: 'pane_list'},
    })
  }

  return ''
}

const mockWait = (args: string[]): string => {
  waitCalls.push({args})
  if (waitResponder) return waitResponder({args})
  return ''
}

// beans CLI mock (getBean inside buildOpeningPrompt/launchAgent)
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
    waitCalls = []
    paneResponder = null
    waitResponder = null
    beansCalls = []
    beansResponder = null
    _setPaneShell(mockPane)
    _setWaitShell(mockWait)
    _setBeansShell(mockBeans)
    _setBeansPresentForTesting(true)
    // Default listPanes returns the workspace root pane.
    _setListPanesForTesting((): PaneInfo[] => [{pane_id: 'wX:p1', workspace_id: 'wX'}])
  })

  afterEach(() => {
    _resetPaneShell()
    _resetWaitShell()
    _resetWhich()
    _resetListPanes()
    _resetBeansShell()
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

  describe('buildOpeningPrompt', () => {
    it('contains the persona verbatim, the bean id, and the acceptance criteria', () => {
      beansResponder = () => JSON.stringify(SAMPLE_BEAN)
      const prompt = buildOpeningPrompt('implementer', makeConfig(), 'hordr-1501')
      expect(prompt).to.contain(PERSONA)
      expect(prompt).to.contain('Bean: hordr-1501')
      expect(prompt).to.contain('Title: Harness resolution + persona injection')
      expect(prompt).to.contain('Build the thing.')
      expect(prompt).to.contain('## Acceptance Criteria')
      expect(prompt).to.contain('- [ ] It works')
    })

    it('includes "(missing)" when the acceptance-criteria section is absent', () => {
      beansResponder = () =>
        JSON.stringify({
          ...SAMPLE_BEAN,
          body: '## Requirement\n\nOnly this.\n',
        })
      const prompt = buildOpeningPrompt('implementer', makeConfig(), 'hordr-1501')
      expect(prompt).to.contain('Only this.')
      expect(prompt).to.contain('(missing)')
    })
  })

  describe('launchAgent', () => {
    it('splits + labels a pane in the worktree cwd and sends harness + prompt; returns the pane_id', () => {
      _setWhichForTesting(() => true)
      beansResponder = () => JSON.stringify(SAMPLE_BEAN)

      const result = launchAgent({
        beanId: 'hordr-1501',
        cwd: '/repo/wt/bean-hordr-1501',
        role: 'implementer',
        workspaceId: 'wX',
      })

      // Returns the pane_id (field name 'paneLabel' is a misnomer; see launcher.ts header).
      expect(result).to.deep.equal({paneLabel: 'wX:pNEW'})

      // 1. pane list was NOT called (we mocked _listPanes directly).
      // 2. pane split called with --pane <parent> --direction right --cwd <cwd>
      const split = paneCalls.find((c) => c.args[0] === 'pane' && c.args[1] === 'split')
      assert.ok(split, 'pane split was called')
      expect(split!.args).to.include('--pane')
      expect(split!.args).to.include('wX:p1')
      expect(split!.args).to.include('--direction')
      expect(split!.args).to.include('right')
      expect(split!.args).to.include('--cwd')
      expect(split!.args).to.include('/repo/wt/bean-hordr-1501')

      // 3. pane rename called with the hordr:<beanId>:<role> label
      const rename = paneCalls.find((c) => c.args[0] === 'pane' && c.args[1] === 'rename')
      assert.ok(rename, 'pane rename was called')
      expect(rename!.args).to.include('wX:pNEW')
      expect(rename!.args).to.include('hordr:hordr-1501:implementer')

      // 4. pane run sends the harness binary as a command (text + Enter)
      const run = paneCalls.find((c) => c.args[0] === 'pane' && c.args[1] === 'run')
      assert.ok(run, 'pane run was called')
      expect(run!.args).to.include('wX:pNEW')
      expect(run!.args).to.include('opencode')

      // 5. pane send-text sends the prompt (no Enter — harness reads stdin)
      const send = paneCalls.find((c) => c.args[0] === 'pane' && c.args[1] === 'send-text')
      assert.ok(send, 'pane send-text was called')
      expect(send!.args).to.include('wX:pNEW')
      const promptArg = send!.args[send!.args.length - 1]
      expect(promptArg).to.contain('Bean: hordr-1501')
    })

    it('throws HarnessError when the workspace has no panes to split from', () => {
      _setWhichForTesting(() => true)
      beansResponder = () => JSON.stringify(SAMPLE_BEAN)
      _setListPanesForTesting(() => [])

      expect(() =>
        launchAgent({
          beanId: 'hordr-1501',
          cwd: '/repo/wt/bean-hordr-1501',
          role: 'implementer',
          workspaceId: 'wX',
        }),
      ).to.throw(HarnessError, /workspace wX has no panes/)
    })
  })
})
