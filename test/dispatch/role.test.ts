/* eslint-disable camelcase -- mock objects mirror snake_case bean/config contracts */
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'
import type {HordrConfig} from '../../src/config/schema.js'

import {DispatchError, resolveRole} from '../../src/dispatch/role.js'

function mockBean(id: string, assigned?: string): BeanRecord {
  const bean: BeanRecord = {
    body: '',
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

  if (assigned !== undefined) (bean as Record<string, unknown>).assigned = assigned
  return bean
}

function mockConfig(roles: Record<string, {harness: string; persona?: string}>): HordrConfig {
  return {
    agents: roles,
    primary_branch: 'develop',
    worktree_branch_prefix: 'bean/',
  }
}

describe('dispatch/role', () => {
  it('resolves role from bean assigned field', () => {
    const bean = mockBean('hordr-0001', 'tester')
    const config = mockConfig({
      implementer: {harness: 'opencode', persona: 'do it'},
      tester: {harness: 'claude', persona: 'test it'},
    })

    const result = resolveRole(bean, config)
    expect(result.role).to.equal('tester')
    expect(result.harness).to.equal('claude')
    expect(result.persona).to.equal('test it')
  })

  it('defaults to implementer when assigned is missing', () => {
    const bean = mockBean('hordr-0001')
    const config = mockConfig({implementer: {harness: 'opencode', persona: 'impl'}})

    const result = resolveRole(bean, config)
    expect(result.role).to.equal('implementer')
  })

  it('throws DispatchError when assigned role is not in config', () => {
    const bean = mockBean('hordr-0001', 'nonexistent')
    const config = mockConfig({implementer: {harness: 'opencode', persona: 'impl'}})

    expect(() => resolveRole(bean, config)).to.throw(DispatchError, /unknown role 'nonexistent'/)
  })

  it('throws DispatchError when default role (implementer) is also missing', () => {
    const bean = mockBean('hordr-0001')
    const config = mockConfig({}) // no roles at all

    expect(() => resolveRole(bean, config)).to.throw(DispatchError, /unknown role 'implementer'/)
  })

  it('supports mixed harness backends per role', () => {
    const config = mockConfig({
      implementer: {harness: 'opencode', persona: 'impl'},
      reviewer: {harness: 'codex', persona: 'review'},
      tester: {harness: 'claude', persona: 'test'},
    })

    expect(resolveRole(mockBean('t1', 'implementer'), config).harness).to.equal('opencode')
    expect(resolveRole(mockBean('t2', 'reviewer'), config).harness).to.equal('codex')
    expect(resolveRole(mockBean('t3', 'tester'), config).harness).to.equal('claude')
  })
})
