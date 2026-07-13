import {expect} from 'chai'

import {buildInvocationPrompt, spawnInvocation} from '../../src/dispatch/spawn.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../src/herdr/pane.js'

describe('dispatch/spawn', () => {
  describe('buildInvocationPrompt', () => {
    it('includes persona, bean body, and the hordr-done completion instructions', () => {
      const prompt = buildInvocationPrompt({
        beanBody: '## Requirement\n\nDo the thing.',
        beanId: 'hordr-1234',
        persona: 'You implement tasks.',
      })

      expect(prompt).to.contain('You implement tasks.')
      expect(prompt).to.contain('# IMPLEMENT THIS — Bean hordr-1234')
      expect(prompt).to.contain('## Requirement')
      expect(prompt).to.contain('Do the thing.')
      expect(prompt).to.contain('hordr done hordr-1234')
      expect(prompt).to.contain('beans update hordr-1234 -s completed')
    })

    it('tells the agent to stop after done (one task, one invocation)', () => {
      const prompt = buildInvocationPrompt({
        beanBody: 'body',
        beanId: 'x',
        persona: 'p',
      })

      expect(prompt).to.match(/Then stop/i)
    })

    it('renders ancestor chain as read-only context before the leaf bean', () => {
      const prompt = buildInvocationPrompt({
        ancestors: [
          {body: 'Milestone design decisions.', id: 'ms-1', title: 'Dashboard v2', type: 'milestone'},
          {body: 'Epic scope: rich cards.', id: 'ep-1', title: 'Rich dashboard cards', type: 'epic'},
          {body: 'Feature: rewrite card.', id: 'feat-1', title: 'Rewrite ComposablePolicyCard', type: 'feature'},
        ],
        beanBody: '## Requirement\n\nImplement the card rewrite.',
        beanId: 'task-1',
        persona: 'You implement tasks.',
      })

      // Ancestors appear before the leaf
      const msPos = prompt.indexOf('Milestone design decisions')
      const epicPos = prompt.indexOf('Epic scope')
      const featPos = prompt.indexOf('Feature: rewrite card')
      const leafPos = prompt.indexOf('Implement the card rewrite')
      expect(msPos).to.be.lessThan(epicPos)
      expect(epicPos).to.be.lessThan(featPos)
      expect(featPos).to.be.lessThan(leafPos)

      // Each ancestor has its title and type
      expect(prompt).to.contain('Dashboard v2')
      expect(prompt).to.contain('milestone')
      expect(prompt).to.contain('Rich dashboard cards')
      expect(prompt).to.contain('epic')
      expect(prompt).to.contain('Rewrite ComposablePolicyCard')
      expect(prompt).to.contain('feature')
    })

    it('clearly labels the leaf as IMPLEMENT THIS and ancestors as context only', () => {
      const prompt = buildInvocationPrompt({
        ancestors: [{body: 'ctx', id: 'ep-1', title: 'Epic', type: 'epic'}],
        beanBody: 'Do the work.',
        beanId: 'task-1',
        persona: 'p',
      })

      expect(prompt).to.match(/context only/i)
      expect(prompt).to.match(/do not implement/i)
      expect(prompt).to.match(/implement this/i)
    })

    it('works without ancestors (backward compat)', () => {
      const prompt = buildInvocationPrompt({
        beanBody: 'body',
        beanId: 'x',
        persona: 'p',
      })

      expect(prompt).to.not.match(/context only/i)
      expect(prompt).to.contain('# IMPLEMENT THIS — Bean x')
      expect(prompt).to.contain('body')
    })
  })

  describe('spawnInvocation', () => {
    let paneCalls: string[][]

    beforeEach(() => {
      paneCalls = []
      _setPaneShell((args) => {
        paneCalls.push(args)
        return '{}'
      })
    })

    afterEach(() => {
      _resetPaneShell()
    })

    it('runs the harness in the specified pane with the prompt shell-quoted', () => {
      spawnInvocation({
        harness: 'opencode',
        paneId: 'w1:p1',
        prompt: 'do the thing',
      })

      expect(paneCalls).to.have.length(1)
      expect(paneCalls[0]!.slice(0, 3)).to.deep.equal(['pane', 'run', 'w1:p1'])
      expect(paneCalls[0]!.join(' ')).to.contain('opencode run --interactive')
      expect(paneCalls[0]!.join(' ')).to.contain('do the thing')
    })

    it('supports different harness binaries (mixed backends)', () => {
      spawnInvocation({harness: 'claude', paneId: 'p1', prompt: 'review it'})
      expect(paneCalls[0]!.join(' ')).to.contain('claude run --interactive')
    })
  })
})
