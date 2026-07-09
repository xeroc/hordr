import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  type DispatchableBean,
  getDispatchable,
  listDrafts,
  pickDispatchable,
  type ShellFn,
} from '../../src/dispatch/dispatch.js'

const bean = (id: string, priority: string, assigned?: string, type = 'task'): DispatchableBean => ({
  assigned,
  id,
  priority,
  title: `Task ${id}`,
  type,
})

describe('dispatch/dispatch', () => {
  describe('pickDispatchable (pure)', () => {
    it('returns the intersection of descendants ∩ ready, sorted by priority then id', () => {
      const descendants = [
        bean('hordr-0001', 'normal'),
        bean('hordr-0002', 'critical'),
        bean('hordr-0003', 'high'),
        bean('hordr-0004', 'normal'),
      ]
      const ready = [
        bean('hordr-0001', 'normal'),
        bean('hordr-0002', 'critical'),
        bean('hordr-0004', 'normal'),
        bean('hordr-0099', 'critical'),
      ]

      const result = pickDispatchable(descendants, ready)
      expect(result.map((b) => b.id)).to.deep.equal(['hordr-0002', 'hordr-0001', 'hordr-0004'])
    })

    it('returns empty when descendants ∩ ready is empty', () => {
      expect(pickDispatchable([bean('hordr-0001', 'normal')], [bean('hordr-0099', 'critical')])).to.have.length(0)
    })

    // ADR-0013: draft beans are never dispatched. The gate is beans' `--ready`
    // filter (drafts are excluded from --ready), so pickDispatchable — which
    // intersects descendants ∩ ready — never selects a draft. No hordr-side
    // governance code; this test pins the invariant.
    it('never dispatches a draft bean (excluded by beans --ready filter)', () => {
      const descendants = [
        bean('hordr-0001', 'normal'), // a ready task
        bean('hordr-0002', 'normal'), // a draft task (NOT in --ready)
      ]
      const ready = [bean('hordr-0001', 'normal')] // draft hordr-0002 absent
      expect(pickDispatchable(descendants, ready).map((b) => b.id)).to.deep.equal(['hordr-0001'])
    })

    it('preserves assigned field from the ready set', () => {
      const result = pickDispatchable([bean('hordr-0001', 'normal')], [bean('hordr-0001', 'normal', 'implementer')])
      expect(result[0]!.assigned).to.equal('implementer')
    })

    it('priority order: critical > high > normal > low > deferred', () => {
      const all = [
        bean('a', 'low'),
        bean('b', 'critical'),
        bean('c', 'deferred'),
        bean('d', 'high'),
        bean('e', 'normal'),
      ]
      expect(pickDispatchable(all, all).map((b) => b.id)).to.deep.equal(['b', 'd', 'e', 'a', 'c'])
    })

    it('excludes feature/epic/milestone beans — only task and bug are executable', () => {
      const descendants = [
        bean('task-1', 'normal', undefined, 'task'),
        bean('feat-1', 'normal', undefined, 'feature'),
        bean('epic-1', 'normal', undefined, 'epic'),
        bean('bug-1', 'normal', undefined, 'bug'),
      ]
      const ready = [
        bean('task-1', 'normal', undefined, 'task'),
        bean('feat-1', 'normal', undefined, 'feature'),
        bean('epic-1', 'normal', undefined, 'epic'),
        bean('bug-1', 'normal', undefined, 'bug'),
      ]

      const result = pickDispatchable(descendants, ready)
      expect(result.map((b) => b.id)).to.deep.equal(['bug-1', 'task-1'])
    })
  })

  describe('getDispatchable (mocked shell)', () => {
    let calls: Array<{args: string[]; cwd?: string}>

    beforeEach(() => {
      calls = []
      const mock: ShellFn = (args, opts) => {
        calls.push({args, cwd: opts?.cwd})
        const joined = args.join(' ')
        if (joined.startsWith('query')) {
          return JSON.stringify({
            bean: {
              children: [
                {id: 'hordr-0001', title: 'T1', type: 'task'},
                {id: 'hordr-0002', title: 'T2', type: 'task'},
                {id: 'hordr-0003', title: 'T3', type: 'task'},
              ],
            },
          })
        }

        if (joined.includes('list') && joined.includes('--ready')) {
          return JSON.stringify([
            {assigned: 'implementer', id: 'hordr-0001', priority: 'normal', title: 'T1', type: 'task'},
            {assigned: 'tester', id: 'hordr-0002', priority: 'critical', title: 'T2', type: 'task'},
          ])
        }

        throw new Error(`unexpected beans call: ${joined}`)
      }

      _setShellForTesting(mock)
    })

    afterEach(() => {
      _resetShell()
    })

    it('queries descendants and ready, returns intersection sorted by priority', () => {
      const result = getDispatchable('hordr-test', {cwd: '/wt'})

      expect(calls).to.have.length(2)
      expect(calls.some((c) => c.args[0] === 'query')).to.be.true
      expect(calls.some((c) => c.args.includes('--ready'))).to.be.true
      expect(calls.every((c) => c.cwd === '/wt')).to.be.true

      expect(result.map((b) => b.id)).to.deep.equal(['hordr-0002', 'hordr-0001'])
      expect(result[0]!.assigned).to.equal('tester')
    })

    it('returns empty when no descendants are ready', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const mock: ShellFn = (args) => {
        const joined = args.join(' ')
        if (joined.startsWith('query')) {
          return JSON.stringify({bean: {children: [{id: 'hordr-0001', type: 'task'}]}})
        }

        if (joined.includes('--ready')) return JSON.stringify([])
        throw new Error(`unexpected: ${joined}`)
      }

      _setShellForTesting(mock)
      expect(getDispatchable('hordr-test')).to.have.length(0)
    })

    it('handles nested descendants (epic → task)', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local mock
      const mock: ShellFn = (args) => {
        const joined = args.join(' ')
        if (joined.startsWith('query')) {
          return JSON.stringify({
            bean: {
              children: [
                {
                  children: [
                    {id: 'hordr-0001', type: 'task'},
                    {id: 'hordr-0002', type: 'task'},
                  ],
                  id: 'epic-1',
                  type: 'epic',
                },
                {id: 'hordr-0003', type: 'task'},
              ],
            },
          })
        }

        if (joined.includes('--ready')) {
          return JSON.stringify([
            {assigned: 'implementer', id: 'hordr-0002', priority: 'high', title: 'T2', type: 'task'},
            {assigned: 'tester', id: 'hordr-0003', priority: 'normal', title: 'T3', type: 'task'},
          ])
        }

        throw new Error(`unexpected: ${joined}`)
      }

      _setShellForTesting(mock)
      const result = getDispatchable('hordr-test')
      expect(result.map((b) => b.id)).to.deep.equal(['hordr-0002', 'hordr-0003'])
    })

    it('listDrafts returns only status==draft descendants (any depth)', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({
            bean: {
              children: [
                {
                  children: [
                    {id: 'hordr-0001', status: 'todo', title: 'T1'},
                    {id: 'hordr-0002', status: 'draft', title: 'T2'},
                  ],
                  id: 'epic-1',
                  status: 'todo',
                  title: 'Epic 1',
                },
                {id: 'hordr-0003', status: 'draft', title: 'T3'},
                {id: 'hordr-0004', status: 'completed', title: 'T4'},
              ],
            },
          })
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })

      const drafts = listDrafts('hordr-test')
      expect(drafts).to.deep.equal([
        {id: 'hordr-0002', title: 'T2'},
        {id: 'hordr-0003', title: 'T3'},
      ])
    })
  })
})
