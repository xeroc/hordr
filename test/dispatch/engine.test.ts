/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'
import {mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {HordrConfig} from '../../src/config/schema.js'

import {_resetShell, _setShellForTesting, type ShellFn} from '../../src/dispatch/dispatch.js'
import {createFleetEngine, type FleetEngine} from '../../src/dispatch/engine.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {ensureProject, getFleet, registerFleet} from '../../src/storage/fleets.js'

const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
}

describe('dispatch/engine', () => {
  it('createFleetEngine returns an object with exactly 3 methods (advanceLane, continueTask, scanFleet)', () => {
    const engine: FleetEngine = createFleetEngine(config)

    const keys = Object.keys(engine).sort()
    expect(keys).to.deep.equal(['advanceLane', 'continueTask', 'scanFleet'])
    expect(typeof engine.scanFleet).to.equal('function')
    expect(typeof engine.advanceLane).to.equal('function')
  })

  describe('scanFleet: missing ms worktree quarantine (hordr-zqwo)', () => {
    let db: Database.Database

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
    })

    afterEach(() => {
      _resetShell()
      db.close()
    })

    it('marks the fleet broken and skips it — no throw, no beans call — when the ms worktree is gone', () => {
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: '/does/not/exist/fleet-wt',
      })

      // Spy that fails loud if the guard is missing and fetchEpics runs.
      let shellCalled = false
      _setShellForTesting((() => {
        shellCalled = true
        throw new Error('beans shell must not be called for a worktree-less fleet')
      }) as ShellFn)

      const engine = createFleetEngine(config)

      // Previously this bricked the whole tick with an uncaught throw.
      expect(() => engine.scanFleet(db)).to.not.throw()

      expect(shellCalled, 'beans shell must not be touched for the quarantined fleet').to.equal(false)
      expect(getFleet(db, 'pk1', 'ms1')!.status).to.equal('broken')
    })

    it('does not let one broken fleet abort scanning of other healthy fleets', () => {
      registerFleet(db, {
        branch: 'ms/broken',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'broken-ms',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: '/does/not/exist/fleet-wt',
      })
      // A second fleet whose worktree exists on disk — it must still be scanned.
      const healthyWt = join(tmpdir(), `hordr-healthy-fleet-wt-${process.pid}`)
      mkdirSync(healthyWt, {recursive: true})
      registerFleet(db, {
        branch: 'ms/healthy',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'healthy-ms',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: healthyWt,
      })

      const shellCwds: string[] = []
      // Healthy fleet: return empty epic children so scanFleet completes cleanly.
      _setShellForTesting(((_args, opts) => {
        shellCwds.push(opts?.cwd ?? '<no-cwd>')
        return '{"bean":{"children":[]}}'
      }) as ShellFn)

      const engine = createFleetEngine(config)

      expect(() => engine.scanFleet(db)).to.not.throw()

      expect(getFleet(db, 'pk1', 'broken-ms')!.status).to.equal('broken')
      // The healthy fleet's worktree cwd reached the beans shell → it was not abandoned.
      expect(shellCwds, 'healthy fleet must still be scanned').to.include(healthyWt)
      expect(shellCwds, 'broken fleet cwd must never reach beans').to.not.include('/does/not/exist/fleet-wt')
    })
  })
})
