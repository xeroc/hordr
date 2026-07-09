/* eslint-disable camelcase -- task_id mirrors the /done socket JSON contract */
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../src/beans/client.js'
import {createTickDeps, doneRouteHandler, startBroker, tickIntervalMs} from '../../src/daemon/broker.js'
import {applySchema, openDb} from '../../src/storage/db.js'

describe('daemon/broker', () => {
  describe('tickIntervalMs', () => {
    const orig = process.env.HORDR_TICK_MS

    afterEach(() => {
      if (orig === undefined) delete process.env.HORDR_TICK_MS
      else process.env.HORDR_TICK_MS = orig
    })

    it('defaults to 5000ms', () => {
      delete process.env.HORDR_TICK_MS
      expect(tickIntervalMs()).to.equal(5000)
    })

    it('honours HORDR_TICK_MS', () => {
      process.env.HORDR_TICK_MS = '250'
      expect(tickIntervalMs()).to.equal(250)
    })

    it('falls back to default on garbage', () => {
      process.env.HORDR_TICK_MS = 'nope'
      expect(tickIntervalMs()).to.equal(5000)
    })
  })

  describe('startBroker', () => {
    it('calls tickFn on the interval and stops cleanly', (done) => {
      const db = openDb(':memory:')
      applySchema(db)
      let calls = 0
      const broker = startBroker({
        db,
        deps: {} as never,
        intervalMs: 10,
        tickFn() {
          calls++
        },
      })

      setTimeout(() => {
        broker.stop()
        try {
          expect(calls).to.be.greaterThan(0)
          const before = calls
          setTimeout(() => {
            expect(calls).to.equal(before) // no more ticks after stop
            db.close()
            done()
          }, 30)
        } catch (error) {
          db.close()
          done(error as Error)
        }
      }, 35)
    })

    it('a throwing tick does not kill the loop', (done) => {
      const db = openDb(':memory:')
      applySchema(db)
      let good = 0
      let throwNext = true
      const broker = startBroker({
        db,
        deps: {} as never,
        intervalMs: 5,
        tickFn() {
          if (throwNext) {
            throwNext = false
            throw new Error('boom')
          }

          good++
        },
      })

      setTimeout(() => {
        broker.stop()
        try {
          expect(good).to.be.greaterThan(0) // recovered after the throw
          db.close()
          done()
        } catch (error) {
          db.close()
          done(error as Error)
        }
      }, 30)
    })
  })

  describe('doneRouteHandler', () => {
    const handler = doneRouteHandler((id) => id === 'task-done')

    it('returns 400 when task_id is missing', () => {
      const res = handler({body: {}, method: 'POST', path: '/done'})
      expect(res.status).to.equal(400)
    })

    it('returns 200 when the task is completed', () => {
      const res = handler({body: {task_id: 'task-done'}, method: 'POST', path: '/done'})
      expect(res.status).to.equal(200)
      expect(res.body).to.deep.equal({ok: true, task_id: 'task-done'})
    })

    it('returns 409 when the task is not completed', () => {
      const res = handler({body: {task_id: 'task-open'}, method: 'POST', path: '/done'})
      expect(res.status).to.equal(409)
    })
  })

  describe('createTickDeps.markCompleted', () => {
    let beansCalls: string[][]

    beforeEach(() => {
      beansCalls = []
      _setBeansShell((_cmd, args) => {
        beansCalls.push(args)
        return ''
      })
    })

    afterEach(() => {
      _resetBeansShell()
    })

    it('runs `beans update <id> -s completed` (ADR-0011 rollup wiring)', () => {
      const config: HordrConfig = {
        agents: {implementer: {harness: 'opencode', persona: 'x'}},
        primary_branch: 'develop',
        worktree_branch_prefix: 'bean/',
      }
      const deps = createTickDeps(config, '/repo')
      deps.markCompleted('hordr-1001')
      const updateCall = beansCalls.find((a) => a[0] === 'update')
      expect(updateCall).to.deep.equal(['update', 'hordr-1001', '-s', 'completed'])
    })
  })
})
