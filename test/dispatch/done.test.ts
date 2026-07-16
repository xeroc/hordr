/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
import {expect} from 'chai'

import {type DoneProbes, handleDone, runDoneChecks, type VerifyResult} from '../../src/dispatch/done.js'

describe('dispatch/done', () => {
  describe('handleDone', () => {
    it('returns 200 when verification passes', () => {
      const res = handleDone({task_id: 'hordr-1234'}, {verify: () => ({errors: [], ok: true})})
      expect(res.status).to.equal(200)
      expect((res.body as {ok: boolean; task_id: string}).ok).to.be.true
      expect((res.body as {task_id: string}).task_id).to.equal('hordr-1234')
    })

    it('returns 400 when task_id is missing', () => {
      const res = handleDone({}, {verify: () => ({errors: [], ok: true})})
      expect(res.status).to.equal(400)
      expect((res.body as {error: string}).error).to.match(/task_id/)
    })

    it('returns 400 when body is null/undefined', () => {
      expect(handleDone(undefined, {verify: () => ({errors: [], ok: true})}).status).to.equal(400)
      expect(handleDone(null, {verify: () => ({errors: [], ok: true})}).status).to.equal(400)
    })

    it('returns 409 with the specific failure reasons when verification fails', () => {
      const res = handleDone(
        {task_id: 'hordr-1234'},
        {
          verify: () =>
            ({
              errors: ['bean hordr-1234 status is in-progress', 'uncommitted changes in /wt'],
              ok: false,
            }) as VerifyResult,
        },
      )
      expect(res.status).to.equal(409)
      const body = res.body as {error: string; task_id: string}
      expect(body.task_id).to.equal('hordr-1234')
      expect(body.error).to.contain('bean hordr-1234 status is in-progress')
      expect(body.error).to.contain('uncommitted changes in /wt')
    })

    it('calls verify with the task_id', () => {
      let captured: string | undefined
      handleDone(
        {task_id: 'hordr-5678'},
        {
          verify(id) {
            captured = id
            return {errors: [], ok: true}
          },
        },
      )
      expect(captured).to.equal('hordr-5678')
    })
  })

  describe('runDoneChecks (hordr-w8w2)', () => {
    const ok: DoneProbes = {
      beanStatus: () => 'completed',
      dirtyPaths: () => [],
      worktreePath: () => '/wt/task',
    }

    it('passes when the bean is completed and the worktree is clean', () => {
      expect(runDoneChecks('hordr-1', ok)).to.deep.equal({errors: [], ok: true})
    })

    it('fails with an actionable error when the bean is not completed', () => {
      const probes: DoneProbes = {...ok, beanStatus: () => 'in-progress'}
      const result = runDoneChecks('hordr-1', probes)
      expect(result.ok).to.equal(false)
      expect(result.errors).to.have.length(1)
      expect(result.errors[0]).to.match(/hordr-1.*'in-progress'.*'completed'/)
    })

    it('fails with an actionable error when the worktree has uncommitted changes', () => {
      const probes: DoneProbes = {...ok, dirtyPaths: () => [' M src/foo.ts', '?? untracked.txt']}
      const result = runDoneChecks('hordr-1', probes)
      expect(result.ok).to.equal(false)
      expect(result.errors).to.have.length(1)
      expect(result.errors[0]).to.contain('uncommitted changes')
      expect(result.errors[0]).to.contain('src/foo.ts')
      expect(result.errors[0]).to.contain('untracked.txt')
    })

    it('collects BOTH errors when both checks fail', () => {
      const probes: DoneProbes = {beanStatus: () => 'todo', dirtyPaths: () => [' M a.ts'], worktreePath: () => '/wt'}
      const result = runDoneChecks('hordr-9', probes)
      expect(result.ok).to.equal(false)
      expect(result.errors).to.have.length(2)
    })

    it('acks OK when no lane owns the task (heal race already processed it)', () => {
      const probes: DoneProbes = {
        beanStatus: () => 'completed',
        dirtyPaths: () => [],
        // eslint-disable-next-line unicorn/no-useless-undefined -- contract returns undefined when no lane owns the task
        worktreePath: () => undefined,
      }
      expect(runDoneChecks('hordr-1', probes)).to.deep.equal({errors: [], ok: true})
    })
  })
})
