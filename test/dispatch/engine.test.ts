/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'
import {mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {HordrConfig} from '../../src/config/schema.js'

import {
  _resetShell as _resetBeansShell,
  _setShellForTesting as _setBeansShell,
  type ShellFn as BeansShellFn,
} from '../../src/beans/client.js'
import {_resetShell, _setShellForTesting, type ShellFn} from '../../src/dispatch/dispatch.js'
import {createFleetEngine, type FleetEngine} from '../../src/dispatch/engine.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, getFleet, listLanes, registerFleet} from '../../src/storage/fleets.js'

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

  describe('scanFleet: stale done lane cleanup (hordr-sq00)', () => {
    let db: Database.Database
    let wt: string

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      wt = join(tmpdir(), `hordr-stale-done-wt-${process.pid}-${Date.now()}`)
      mkdirSync(wt, {recursive: true})
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: wt,
      })
      // A 'done' lane for an epic whose status is still 'todo' but whose
      // blocked-by dependency has just completed — so getDispatchable now
      // returns ready work. This is the premature-close case.
      addLane(db, {
        branch: 'ms/epic-a',
        createdAt: '2026-07-16T00:00:00Z',
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: 'ms1',
        paneId: 'p1',
        projectKey: 'pk1',
        status: 'done',
        workspaceId: 'ws1',
        worktreePath: wt,
      })
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      db.close()
    })

    it('deletes a done lane whose epic is not completed and has ready work (so scan recreates it next pass)', () => {
      // beans/client.ts shell (getBean calls `beans show --json <id>`):
      // epic-a is still 'todo' — work remains. BEAN_BIN may be an absolute
      // path, so match on args, not cmd.
      _setBeansShell(((cmd: string, args: string[]) => {
        if (args[0] === 'show' && args[2] === 'epic-a') {
          return JSON.stringify({
            body: '',
            created_at: '',
            etag: 'e1',
            id: 'epic-a',
            path: 'p',
            priority: 'normal',
            slug: 'epic-a',
            status: 'todo',
            title: 'Epic A',
            type: 'epic',
            updated_at: '',
          })
        }

        throw new Error(`unexpected beans call: ${cmd} ${args.join(' ')}`)
      }) as BeansShellFn)

      // dispatch.ts shell:
      //  - fetchEpics: `{ bean(id:"ms1") { children { id title } } }` → epic-a is the only child
      //  - getDispatchable(epic-a) → fetchDescendants + fetchReady → non-empty
      // dispatch.ts shell handles two call shapes:
      //  - `beans list --ready --json`      → fetchReady (array of ready beans)
      //  - `beans query --json '{ ... }'`    → fetchEpics + fetchDescendants
      _setShellForTesting(((args: string[], _opts?: {cwd?: string}) => {
        if (args[0] === 'list') {
          return JSON.stringify([{id: 'task-a', priority: 'normal', status: 'todo', title: 'Task A', type: 'task'}])
        }

        return JSON.stringify({
          bean: {
            children: [
              {
                children: [{id: 'task-a', priority: 'normal', title: 'Task A', type: 'task'}],
                id: 'epic-a',
                priority: 'normal',
                title: 'Epic A',
                type: 'epic',
              },
            ],
            id: 'ms1',
          },
        })
      }) as ShellFn)

      const engine = createFleetEngine(config)
      expect(() => engine.scanFleet(db)).to.not.throw()

      const lanes = listLanes(db, 'pk1', 'ms1')
      // The done lane must be gone so scanForNewLanes recreates a fresh one
      // on the next scanFleet pass. Currently engine.ts:472-475 skips it
      // unconditionally → the row survives, work stays stuck.
      expect(
        lanes.find((l) => l.epicBeanId === 'epic-a'),
        'stale done lane row must be deleted',
      ).to.equal(undefined)
    })
  })
})
