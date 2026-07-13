/* eslint-disable camelcase -- mock objects mirror snake_case bean contracts */
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'
import type {HordrConfig} from '../../src/config/schema.js'
import type {DispatchableBean} from '../../src/dispatch/dispatch.js'

import {dispatchNext, type LaneContext} from '../../src/dispatch/loop.js'

const config: HordrConfig = {
  agents: {
    implementer: {harness: 'opencode', persona: 'You implement tasks.'},
    tester: {harness: 'claude', persona: 'You test implementations.'},
  },
  primary_branch: 'develop',
  worktree_branch_prefix: 'bean/',
}

const ctx: LaneContext = {
  epicId: 'hordr-ep1',
  paneId: 'w1:p1',
  worktreePath: '/wt/hordr-ep1',
}

function mockBean(id: string, assigned: string, body: string): BeanRecord {
  const bean: BeanRecord = {
    body,
    created_at: '2026-01-01',
    etag: 'e1',
    id,
    path: `${id}.md`,
    priority: 'normal',
    slug: 'x',
    status: 'todo',
    title: id,
    type: 'task',
    updated_at: '2026-01-01',
  }

  ;(bean as Record<string, unknown>).assigned = assigned
  return bean
}

describe('dispatch/loop', () => {
  it('picks the highest-priority dispatchable task and spawns an invocation', () => {
    const dispatchable: DispatchableBean[] = [
      {assigned: 'tester', id: 'hordr-0002', priority: 'critical', title: 'T2', type: 'task'},
      {assigned: 'implementer', id: 'hordr-0001', priority: 'normal', title: 'T1', type: 'task'},
    ]

    let spawned: undefined | {harness: string; prompt: string}
    const result = dispatchNext(ctx, config, {
      fetchAncestorChain: () => [],
      fetchBean(id) {
        const d = dispatchable.find((b) => b.id === id)!
        return mockBean(id, d.assigned!, `Body of ${id}`)
      },
      fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
      fetchDispatchable: () => dispatchable,
      spawn(harness, prompt) {
        spawned = {harness, prompt}
      },
    })

    expect(result.dispatched).to.be.true
    expect(result.beanId).to.equal('hordr-0002') // critical first
    expect(result.role).to.equal('tester')
    expect(spawned!.harness).to.equal('claude') // tester's harness
    expect(spawned!.prompt).to.contain('You test implementations.')
    expect(spawned!.prompt).to.contain('Body of hordr-0002')
    expect(spawned!.prompt).to.contain('hordr done hordr-0002')
  })

  it('returns dispatched=false when no tasks are dispatchable', () => {
    const result = dispatchNext(ctx, config, {
      fetchAncestorChain: () => [],
      fetchBean: () => mockBean('x', 'implementer', ''),
      fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
      fetchDispatchable: () => [],
      spawn() {
        throw new Error('should not spawn')
      },
    })

    expect(result.dispatched).to.be.false
  })

  it('includes the bean body in the prompt (agent gets the full brief)', () => {
    const body = '## Requirement\n\nImplement the frobnicator.\n\n## AC\n\n- It frobs.'
    const result = dispatchNext(ctx, config, {
      fetchAncestorChain: () => [],
      fetchBean: () => mockBean('hordr-0001', 'implementer', body),
      fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
      fetchDispatchable: () => [
        {assigned: 'implementer', id: 'hordr-0001', priority: 'normal', title: 'T1', type: 'task'},
      ],
      spawn() {},
    })

    expect(result.dispatched).to.be.true
  })

  it('passes ancestor chain into the prompt as context', () => {
    let spawned: undefined | {harness: string; prompt: string}
    dispatchNext(ctx, config, {
      fetchAncestorChain: () => [{body: 'Epic body text', id: 'ep-1', title: 'My Epic', type: 'epic'}],
      fetchBean: () => mockBean('hordr-0001', 'implementer', 'Task body'),
      fetchDependencyStatus: () => ({blockers: [], parentBlockers: [], siblings: []}),
      fetchDispatchable: () => [
        {assigned: 'implementer', id: 'hordr-0001', priority: 'normal', title: 'T1', type: 'task'},
      ],
      spawn(_h, prompt) {
        spawned = {harness: _h, prompt}
      },
    })

    expect(spawned!.prompt).to.contain('Epic body text')
    expect(spawned!.prompt).to.contain('My Epic')
    expect(spawned!.prompt).to.contain('Task body')
    // Ancestor appears before leaf
    expect(spawned!.prompt.indexOf('Epic body text')).to.be.lessThan(spawned!.prompt.indexOf('Task body'))
  })
})
