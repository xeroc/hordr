/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'
import type {LaneLoc} from '../../src/storage/fleets.js'

import {type ContinueDeps, continueLane} from '../../src/dispatch/continue.js'

const config: HordrConfig = {
  agents: {
    implementer: {harness: 'opencode', persona: 'implementer persona'},
    reviewer: {harness: 'claude', persona: 'reviewer persona'},
    tester: {harness: 'opencode', persona: 'tester persona'},
  },
  primary_branch: 'develop',
}

const loc: LaneLoc = {epicId: 'epic-1', milestoneId: 'ms-1', projectKey: 'pk'}

const BEANS: Record<string, {assigned?: string; body?: string; status?: string; type?: string}> = {
  'task-B': {assigned: 'implementer', body: 'body-of-task-B', status: 'completed', type: 'task'},
  'task-C': {assigned: 'tester', body: 'body-of-task-C', status: 'todo', type: 'task'},
  'task-D': {assigned: 'reviewer', body: 'body-of-task-D', status: 'todo', type: 'task'},
}

function makeDeps(overrides: Partial<ContinueDeps> & {beans?: typeof BEANS} = {}): ContinueDeps {
  const beans = overrides.beans ?? BEANS
  const records = {
    rollupCalls: [] as string[],
    setCurrentTaskCalls: [] as Array<{beanId: null | string; locKey: string}>,
  }
  return {
    _records: records,
    config,
    fetchAncestorChain: () => [],
    fetchBean: (id: string) =>
      ({assigned: 'implementer', body: `body-of-${id}`, id, status: 'todo', type: 'task', ...beans[id]}) as never,
    fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
    findLane: () => ({epicId: 'epic-1', loc}),
    getDispatchable: () => [{assigned: 'tester', id: 'task-C', priority: 'normal', title: 'Test C', type: 'task'}],
    rollup(taskId: string) {
      records.rollupCalls.push(taskId)
    },
    setCurrentTask(l: LaneLoc, beanId: null | string) {
      records.setCurrentTaskCalls.push({beanId, locKey: l.epicId})
    },
    ...overrides,
  } as unknown as ContinueDeps & {_records: typeof records}
}

describe('dispatch/continue', () => {
  describe('continueLane — happy path', () => {
    it('returns the next bean with prompt and role when same harness', () => {
      const deps = makeDeps()
      const result = continueLane('task-B', deps)

      expect(result.next).to.not.be.null
      expect(result.next!.id).to.equal('task-C')
      expect(result.next!.role).to.equal('tester')
      expect(result.next!.prompt).to.contain('tester persona')
      expect(result.next!.prompt).to.contain('body-of-task-C')
    })

    it('calls rollup for the completed task before picking next', () => {
      const deps = makeDeps()
      continueLane('task-B', deps)

      expect((deps as unknown as {_records: {rollupCalls: string[]}})._records.rollupCalls).to.deep.equal(['task-B'])
    })

    it('sets currentTaskBeanId to the next bean atomically', () => {
      const deps = makeDeps()
      continueLane('task-B', deps)

      const calls = (deps as unknown as {_records: {setCurrentTaskCalls: Array<{beanId: string}>}})._records
        .setCurrentTaskCalls
      expect(calls).to.have.length(1)
      expect(calls[0]!.beanId).to.equal('task-C')
    })
  })

  describe('continueLane — no continuation', () => {
    it('returns next:null when no lane owns the task (idempotent)', () => {
      const deps = makeDeps({findLane: () => null})
      const result = continueLane('task-B', deps)

      expect(result.next).to.be.null
      expect(result.reason).to.match(/no lane/i)
    })

    it('returns next:null when no dispatchable beans, frees lane', () => {
      const deps = makeDeps({getDispatchable: () => []})
      const result = continueLane('task-B', deps)

      expect(result.next).to.be.null
      const calls = (deps as unknown as {_records: {setCurrentTaskCalls: Array<{beanId: null | string}>}})._records
        .setCurrentTaskCalls
      expect(calls).to.have.length(1)
      expect(calls[0]!.beanId).to.be.null
    })

    it('returns next:null on harness mismatch, frees lane', () => {
      // current bean is implementer (opencode), next is reviewer (claude)
      const deps = makeDeps({
        getDispatchable: () => [
          {assigned: 'reviewer', id: 'task-D', priority: 'normal', title: 'Review D', type: 'task'},
        ],
      })
      const result = continueLane('task-B', deps)

      expect(result.next).to.be.null
      expect(result.reason).to.match(/harness mismatch/)
      const calls = (deps as unknown as {_records: {setCurrentTaskCalls: Array<{beanId: null | string}>}})._records
        .setCurrentTaskCalls
      expect(calls[0]!.beanId).to.be.null
    })
  })

  describe('continueLane — role switch within same harness', () => {
    it('continues from implementer to tester (both opencode)', () => {
      const deps = makeDeps()
      const result = continueLane('task-B', deps)

      expect(result.next).to.not.be.null
      expect(result.next!.role).to.equal('tester')
      expect(result.next!.prompt).to.contain('tester persona')
    })
  })
})
