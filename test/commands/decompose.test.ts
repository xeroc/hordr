/* eslint-disable camelcase -- bean shape mirrors on-disk JSON contract */
import {captureOutput} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import process from 'node:process'

import {
  _resetShell as _resetBeansShell,
  _setBeansPresentForTesting,
  _setShellForTesting as _setBeansShell,
  type ShellFn,
} from '../../src/beans/client.js'
import Decompose from '../../src/commands/decompose.js'
import {_resetWhich, _setWhichForTesting} from '../../src/harness/launcher.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../src/herdr/pane.js'
import {_resetShell as _resetWaitShell, _setShellForTesting as _setWaitShell} from '../../src/herdr/wait.js'

const PROJECT_ROOT = process.cwd()

const EPIC_BODY = `## Requirement

We need a thing.

## Spec

The spec.

## Decisions

- [ADR-0001](docs/adr/0001-x.md) — X

## Decomposition

<!-- empty -->

## Acceptance Criteria

- [ ] It works end-to-end

## Test Plan

E2E test.
`

const EPIC_ALREADY_DECOMPOSED = `## Requirement

We need a thing.

## Spec

The spec.

## Decisions

- [ADR-0001](docs/adr/0001-x.md) — X

## Decomposition

- [ ] hordr-child1 — First child
- [ ] hordr-child2 — Second child

## Acceptance Criteria

- [ ] It works end-to-end

## Test Plan

E2E test.
`

interface BeanShape {
  body: string
  created_at: string
  etag: string
  id: string
  path: string
  priority: string
  slug: string
  status: string
  title: string
  type: string
  updated_at: string
}

function makeBean(overrides: Partial<BeanShape> = {}): BeanShape {
  return {
    body: EPIC_BODY,
    created_at: '2026-06-26T00:00:00Z',
    etag: 'e1',
    id: 'hordr-test-epic',
    path: 'hordr-test-epic.md',
    priority: 'high',
    slug: 'test-epic',
    status: 'todo',
    title: 'Test Epic',
    type: 'epic',
    updated_at: '2026-06-26T00:00:00Z',
    ...overrides,
  }
}

function beanJson(bean: BeanShape): string {
  return JSON.stringify(bean)
}

describe('commands/decompose (hordr-cqjx)', () => {
  let stateDir: string
  let beansCalls: {args: string[]; cmd: string}[] = []
  let beansResponder: ((cmd: string, args: string[]) => string) | null = null

  // Recording wrapper — installed once in beforeEach, never replaced. Tests
  // set `beansResponder` to control the response shape.
  const mockBeans: ShellFn = (cmd, args) => {
    beansCalls.push({args, cmd})
    return beansResponder ? beansResponder(cmd, args) : ''
  }

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'hordr-decompose-'))
    process.env.HERDR_PLUGIN_STATE_DIR = stateDir
    beansCalls = []
    beansResponder = null
    _setBeansShell(mockBeans)
    _setBeansPresentForTesting(true)
    _setWhichForTesting(() => true)
    _setPaneShell((args: string[]) => {
      if (args[0] === 'pane' && args[1] === 'list') {
        return JSON.stringify({
          id: 'cli:pane:list',
          result: {panes: [{pane_id: 'wX:p1', workspace_id: 'wX'}], type: 'pane_list'},
        })
      }

      if (args[0] === 'tab' && args[1] === 'create') {
        return JSON.stringify({
          id: 'cli:tab:create',
          result: {root_pane: {pane_id: 'wX:pNEW'}},
        })
      }

      return ''
    })
    _setWaitShell(() => '')
  })

  afterEach(() => {
    delete process.env.HERDR_PLUGIN_STATE_DIR
    beansResponder = null
    _resetBeansShell()
    _setBeansPresentForTesting(true)
    _resetWhich()
    _resetPaneShell()
    _resetWaitShell()
    rmSync(stateDir, {force: true, recursive: true})
  })

  it('refuses if bean type is not epic', async () => {
    beansResponder = () => beanJson(makeBean({type: 'task'}))
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic'], {root: PROJECT_ROOT})
    })
    expect(result.error).to.exist
    expect(result.error!.message).to.match(/expected 'epic'/)
  })

  it('refuses if bean status is not todo', async () => {
    beansResponder = () => beanJson(makeBean({status: 'completed'}))
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic'], {root: PROJECT_ROOT})
    })
    expect(result.error).to.exist
    expect(result.error!.message).to.match(/expected 'todo'/)
  })

  it('refuses if Decomposition section already has children (without --force)', async () => {
    beansResponder = () => beanJson(makeBean({body: EPIC_ALREADY_DECOMPOSED}))
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic'], {root: PROJECT_ROOT})
    })
    expect(result.error).to.exist
    expect(result.error!.message).to.match(/Decomposition section already has children/)
  })

  it('happy path: spawns planner, waits for done, marks epic completed', async () => {
    beansResponder = () => beanJson(makeBean())
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic'], {root: PROJECT_ROOT})
    })
    expect(result.error, result.error?.message).to.be.undefined

    const setStatusCall = beansCalls.find((c) => c.args.includes('--status') && c.args.includes('completed'))
    expect(setStatusCall, 'setStatus(completed) was called').to.exist
    expect(result.stdout).to.match(/decomposed hordr-test-epic/)
  })

  it('--force overrides the already-decomposed check', async () => {
    beansResponder = () => beanJson(makeBean({body: EPIC_ALREADY_DECOMPOSED}))
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic', '--force'], {root: PROJECT_ROOT})
    })
    expect(result.error, result.error?.message).to.be.undefined

    const setStatusCall = beansCalls.find((c) => c.args.includes('--status') && c.args.includes('completed'))
    expect(setStatusCall, 'setStatus(completed) was called').to.exist
  })

  it('uses the planner persona (tab created with hordr:<epic>:planner label)', async () => {
    beansResponder = () => beanJson(makeBean())

    let receivedLabel = ''
    _setPaneShell((args: string[]) => {
      if (args[0] === 'pane' && args[1] === 'list') {
        return JSON.stringify({result: {panes: [{pane_id: 'wX:p1'}]}})
      }

      if (args[0] === 'tab' && args[1] === 'create') {
        // Capture the --label value.
        const labelIdx = args.indexOf('--label')
        if (labelIdx !== -1) receivedLabel = args[labelIdx + 1] ?? ''
        return JSON.stringify({result: {root_pane: {pane_id: 'wX:pNEW'}}})
      }

      return ''
    })

    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic'], {root: PROJECT_ROOT})
    })
    expect(result.error, result.error?.message).to.be.undefined
    expect(receivedLabel).to.equal('hordr:hordr-test-epic:planner')
  })

  it('--json emits structured output', async () => {
    beansResponder = () => beanJson(makeBean())
    const result = await captureOutput(async () => {
      await Decompose.run(['hordr-test-epic', '--json'], {root: PROJECT_ROOT})
    })
    expect(result.error, result.error?.message).to.be.undefined
    const parsed = JSON.parse(result.stdout.trim()) as {childCount: number; epic: string; status: string}
    expect(parsed.epic).to.equal('hordr-test-epic')
    expect(parsed.status).to.equal('completed')
    expect(parsed.childCount).to.be.a('number')
  })
})
