import { expect } from 'chai'

import { buildInvocationPrompt, spawnInvocation } from '../../src/dispatch/spawn.js'
import { _resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell } from '../../src/herdr/pane.js'

describe('dispatch/spawn', () => {
  describe('buildInvocationPrompt', () => {
    it('includes persona, role, bean body, and the hordr-done completion instructions', () => {
      const prompt = buildInvocationPrompt({
        beanBody: '## Requirement\n\nDo the thing.',
        beanId: 'hordr-1234',
        persona: 'You implement tasks.',
        role: 'implementer',
      })

      expect(prompt).to.contain('You implement tasks.')
      expect(prompt).to.contain('# Bean hordr-1234')
      expect(prompt).to.contain('assigned role: implementer')
      expect(prompt).to.not.match(/implement this/i)
      expect(prompt).to.contain('## Requirement')
      expect(prompt).to.contain('Do the thing.')
      expect(prompt).to.contain('hordr done hordr-1234')
      // Commit-then-signal-done contract (hordr-hge8): the status flip rides
      // INSIDE the commit, never as a separate step before it.
      expect(prompt).to.contain('status flip rides INSIDE the commit')
      expect(prompt).to.contain('Do NOT run `beans update hordr-1234 -s completed` as a separate step')
      expect(prompt).to.contain('Never leave the bean marked `completed` in the working tree uncommitted')
      expect(prompt).to.contain('clean worktree to proceed')
      // Ordering: commit must be instructed before `hordr done`.
      expect(prompt.indexOf('commit')).to.be.lessThan(prompt.indexOf('hordr done hordr-1234'))
    })

    it('renders ancestor chain as read-only context before the leaf bean', () => {
      const prompt = buildInvocationPrompt({
        ancestors: [
          { body: 'Milestone design decisions.', id: 'ms-1', title: 'Dashboard v2', type: 'milestone' },
          { body: 'Epic scope: rich cards.', id: 'ep-1', title: 'Rich dashboard cards', type: 'epic' },
          { body: 'Feature: rewrite card.', id: 'feat-1', title: 'Rewrite ComposablePolicyCard', type: 'feature' },
        ],
        beanBody: '## Requirement\n\nImplement the card rewrite.',
        beanId: 'task-1',
        persona: 'You implement tasks.',
        role: 'implementer',
      })

      // The milestone is singled out into its own section, ahead of other ancestors
      expect(prompt).to.contain('# Context — Milestone')
      expect(prompt).to.contain('# Context — Ancestors')
      expect(prompt.indexOf('# Context — Milestone')).to.be.lessThan(prompt.indexOf('# Context — Ancestors'))

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

    it('labels ancestors as context-only (do not act on) and the leaf by role', () => {
      const prompt = buildInvocationPrompt({
        ancestors: [{ body: 'ctx', id: 'ep-1', title: 'Epic', type: 'epic' }],
        beanBody: 'Do the work.',
        beanId: 'task-1',
        persona: 'p',
        role: 'reviewer',
      })

      expect(prompt).to.match(/context only/i)
      expect(prompt).to.match(/do not act on/i)
      expect(prompt).to.contain('assigned role: reviewer')
      expect(prompt).to.not.match(/implement this/i)
    })

    it('works without ancestors (backward compat)', () => {
      const prompt = buildInvocationPrompt({
        beanBody: 'body',
        beanId: 'x',
        persona: 'p',
        role: 'implementer',
      })

      expect(prompt).to.not.match(/context only/i)
      expect(prompt).to.contain('# Bean x')
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
      spawnInvocation({ harness: 'claude', paneId: 'p1', prompt: 'review it' })
      expect(paneCalls[0]!.join(' ')).to.contain('claude run --interactive')
    })

    it('omp: includes @AGENTS.md in the invocation (no run --interactive)', () => {
      spawnInvocation({ harness: 'omp', paneId: 'w1:p1', prompt: 'do the thing' })
      expect(paneCalls[0]!.join(' ')).to.contain('omp @AGENTS.md')
      expect(paneCalls[0]!.join(' ')).to.not.contain('run --interactive')
    })
  })
})
