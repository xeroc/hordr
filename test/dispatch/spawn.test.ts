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
      expect(prompt).to.contain('# Bean hordr-1234')
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
