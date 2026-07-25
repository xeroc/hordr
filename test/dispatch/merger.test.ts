import {expect} from 'chai'

import {buildMergerPrompt} from '../../src/dispatch/merger.js'

describe('dispatch/merger', () => {
  describe('buildMergerPrompt', () => {
    it('includes persona, source branch, target branch, and conflicted files', () => {
      const prompt = buildMergerPrompt('You are a merger agent.', {
        conflictedFiles: ['src/foo.ts', 'src/bar.ts'],
        sourceBranch: 'epic/auth-feature',
        targetBranch: 'ms/auth-1234',
      })

      expect(prompt).to.include('You are a merger agent.')
      expect(prompt).to.include('epic/auth-feature')
      expect(prompt).to.include('ms/auth-1234')
      expect(prompt).to.include('src/foo.ts')
      expect(prompt).to.include('src/bar.ts')
    })

    it('includes git commit and abort instructions', () => {
      const prompt = buildMergerPrompt('persona', {
        conflictedFiles: [],
        sourceBranch: 'x',
        targetBranch: 'y',
      })

      expect(prompt).to.include('git add -A')
      expect(prompt).to.include('git commit --no-edit')
      expect(prompt).to.include('git merge --abort')
    })

    it('handles empty conflicted files list with fallback instruction', () => {
      const prompt = buildMergerPrompt('persona', {
        conflictedFiles: [],
        sourceBranch: 'x',
        targetBranch: 'y',
      })

      expect(prompt).to.include('git diff --name-only --diff-filter=U')
    })
  })
})
