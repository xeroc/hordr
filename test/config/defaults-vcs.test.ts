import {expect} from 'chai'

import {defaultAgents} from '../../src/config/defaults.js'
import {buildMergerPrompt} from '../../src/dispatch/merger.js'

describe('config + merger vcs variants', () => {
  describe('default agents', () => {
    it('git personas carry the commit-skill contract (historical wording)', () => {
      const agents = defaultAgents('git')
      expect(agents.implementer!.persona).to.contain('commit-then-signal-done')
      expect(agents.implementer!.persona).to.contain('ONE commit via the commit skill')
      expect(agents.merger!.persona).to.contain('git merge --abort')
      expect(agents.tester!.persona).to.contain('when the tests pass,')
      expect(agents.reviewer!.persona).to.contain('when the review passes,')
    })

    it('jj personas carry the describe/new contract and the no-git fence', () => {
      const agents = defaultAgents('jj')
      for (const role of ['implementer', 'reviewer', 'tester'] as const) {
        expect(agents[role]!.persona, role).to.contain('describe-then-signal-done')
        expect(agents[role]!.persona, role).to.contain('jj --no-pager describe')
        expect(agents[role]!.persona, role).to.contain('NEVER run git commands in this workspace')
      }

      expect(agents.implementer!.persona).not.to.contain('commit skill')
      expect(agents.merger!.persona).to.contain('jj abandon @')
      expect(agents.merger!.persona).to.contain('do NOT run `jj new`')
    })
  })

  describe('buildMergerPrompt', () => {
    const ctx = {conflictedFiles: ['src/a.ts'], sourceBranch: 'hordr-epic1', targetBranch: 'ms/hordr-ms1'}

    it('git prompt (default): worktree on branch, git add/commit, merge --abort', () => {
      const prompt = buildMergerPrompt('persona.', ctx)
      expect(prompt).to.contain('git worktree on branch `ms/hordr-ms1`')
      expect(prompt).to.contain('git add -A')
      expect(prompt).to.contain('git merge --abort')
      expect(prompt).to.not.contain('jj')
    })

    it('jj prompt: conflicted @ merge, describe, abandon; no git instructions', () => {
      const prompt = buildMergerPrompt('persona.', {...ctx, vcs: 'jj'})
      expect(prompt).to.contain('conflicted merge of `hordr-epic1`')
      expect(prompt).to.contain('jj --no-pager describe')
      expect(prompt).to.contain('Do NOT run `jj new`')
      expect(prompt).to.contain('jj abandon @')
      expect(prompt).to.not.contain('git add')
      expect(prompt).to.not.contain('merge --abort')
    })

    it('empty conflict list points at the vcs-specific list command', () => {
      const gitPrompt = buildMergerPrompt('p.', {...ctx, conflictedFiles: []})
      const jjPrompt = buildMergerPrompt('p.', {...ctx, conflictedFiles: [], vcs: 'jj'})
      expect(gitPrompt).to.contain('git diff --name-only --diff-filter=U')
      expect(jjPrompt).to.contain('jj --no-pager resolve --list')
    })
  })
})
