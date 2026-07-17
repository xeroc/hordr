import {expect} from 'chai'

import {
  _resetShell,
  _setShellForTesting,
  type DispatchableBean,
  fetchAncestorChain,
  fetchAncestry,
  fetchDependencyStatus,
  fetchEpics,
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

    it('excludes epic/milestone + features-with-children; dispatches leaf features, tasks, bugs', () => {
      const descendants = [
        bean('task-1', 'normal', undefined, 'task'),
        bean('feat-leaf', 'normal', undefined, 'feature'),
        bean('feat-container', 'normal', undefined, 'feature'),
        bean('epic-1', 'normal', undefined, 'epic'),
        bean('bug-1', 'normal', undefined, 'bug'),
      ]
      const ready = [
        bean('task-1', 'normal', undefined, 'task'),
        bean('feat-leaf', 'normal', undefined, 'feature'),
        bean('feat-container', 'normal', undefined, 'feature'),
        bean('epic-1', 'normal', undefined, 'epic'),
        bean('bug-1', 'normal', undefined, 'bug'),
      ]
      // feat-container has children → it's a container, not dispatchable
      const containerIds = new Set(['feat-container'])

      const result = pickDispatchable(descendants, ready, containerIds)
      expect(result.map((b) => b.id)).to.deep.equal(['bug-1', 'feat-leaf', 'task-1'])
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

    it('fetchEpics returns the milestone direct children', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({
            bean: {
              children: [
                {id: 'epic-1', title: 'Epic 1'},
                {id: 'epic-2', title: 'Epic 2'},
              ],
            },
          })
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      expect(fetchEpics('hordr-ms1')).to.deep.equal([
        {id: 'epic-1', title: 'Epic 1'},
        {id: 'epic-2', title: 'Epic 2'},
      ])
    })

    it('fetchAncestry walks task→feature→epic, stopping at epic', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({
            bean: {
              // task's parent is a feature; feature's parent is the epic
              parent: {
                children: [
                  {id: 'task-1', status: 'completed'},
                  {id: 'task-2', status: 'completed'},
                ],
                id: 'feat-1',
                parent: {
                  children: [
                    {id: 'feat-1', status: 'in-progress'},
                    {id: 'feat-2', status: 'todo'},
                  ],
                  id: 'epic-1',
                  status: 'todo',
                  type: 'epic',
                },
                status: 'todo',
                type: 'feature',
              },
            },
          })
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      const ancestry = fetchAncestry('task-1')
      expect(ancestry).to.deep.equal([
        {descendantsAllCompleted: true, id: 'feat-1', status: 'todo'}, // both tasks done
        {descendantsAllCompleted: false, id: 'epic-1', status: 'todo'}, // feat-2 still todo
      ])
    })

    it('fetchAncestry stops at epic when task is directly under it', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({
            bean: {
              parent: {
                children: [
                  {id: 'task-1', status: 'completed'},
                  {id: 'task-2', status: 'todo'},
                ],
                id: 'epic-1',
                status: 'todo',
                type: 'epic',
              },
            },
          })
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      expect(fetchAncestry('task-1')).to.deep.equal([{descendantsAllCompleted: false, id: 'epic-1', status: 'todo'}])
    })

    it('fetchAncestorChain walks root→leaf with body+title+type', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({
            bean: {
              parent: {
                body: 'Rewrite the card.',
                id: 'feat-1',
                parent: {
                  body: 'Rich cards epic.',
                  id: 'epic-1',
                  parent: {
                    body: 'Dashboard v2 design decisions.',
                    id: 'ms-1',
                    title: 'Dashboard v2',
                    type: 'milestone',
                  },
                  title: 'Rich dashboard cards',
                  type: 'epic',
                },
                title: 'Rewrite ComposablePolicyCard',
                type: 'feature',
              },
            },
          })
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })

      const chain = fetchAncestorChain('task-1')
      expect(chain).to.deep.equal([
        {body: 'Dashboard v2 design decisions.', id: 'ms-1', title: 'Dashboard v2', type: 'milestone'},
        {body: 'Rich cards epic.', id: 'epic-1', title: 'Rich dashboard cards', type: 'epic'},
        {body: 'Rewrite the card.', id: 'feat-1', title: 'Rewrite ComposablePolicyCard', type: 'feature'},
      ])
    })

    it('fetchAncestorChain returns empty when bean has no parent', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) return JSON.stringify({bean: {parent: null}})
        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      expect(fetchAncestorChain('solo-1')).to.deep.equal([])
    })

    it('fetchDependencyStatus returns blockers, siblings, and parent blockers', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) {
          return JSON.stringify({bean: {blockedBy: [{id: 'epic-A', status: 'todo', title: 'Shared module'}], parent: {blockedBy: [{id: 'epic-A', status: 'todo', title: 'Shared module'}], children: [{id: 'task-1', status: 'todo', title: 'My task', type: 'task'}, {id: 'task-2', status: 'todo', title: 'Sibling resolver', type: 'task'}, {id: 'task-3', status: 'completed', title: 'Done sibling', type: 'task'}], id: 'feat-1'}}})
        }

        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      const deps = fetchDependencyStatus('task-1')
      expect(deps.blockers).to.deep.equal([{id: 'epic-A', status: 'todo', title: 'Shared module'}])
      expect(deps.parentBlockers).to.deep.equal([{id: 'epic-A', status: 'todo', title: 'Shared module'}])
      expect(deps.siblings.map((s) => s.id)).to.deep.equal(['task-2', 'task-3'])
    })

    it('fetchDependencyStatus handles parentless beans', () => {
      _setShellForTesting((args) => {
        if (args.includes('query')) return JSON.stringify({bean: {blockedBy: [], parent: null}})
        throw new Error(`unexpected: ${args.join(' ')}`)
      })
      const deps = fetchDependencyStatus('solo-1')
      expect(deps.blockers).to.deep.equal([])
      expect(deps.siblings).to.deep.equal([])
    })
  })
})
