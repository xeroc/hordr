/* eslint-disable camelcase -- BeanRecord mirrors the on-disk snake_case contract */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'
import type {MergeOutcome, Vcs} from '../../src/vcs/types.js'

import {abortFleet, createFleet, describeFleet, finishFleet, FleetError, resetLane} from '../../src/fleet/lifecycle.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShellForTesting} from '../../src/herdr/pane.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, type FleetRow, getFleet, listLanes, registerFleet} from '../../src/storage/fleets.js'

const PK = 'pk1'
const MS = 'hordr-ms1'
const PRIMARY = 'develop'
const NOW = '2026-07-09T00:00:00Z'

function milestoneBean(overrides: Partial<BeanRecord> = {}): BeanRecord {
  return {
    body: '',
    created_at: '2026-01-01T00:00:00Z',
    etag: 'e1',
    id: MS,
    path: 'x.md',
    priority: 'normal',
    slug: 'x',
    status: 'todo',
    title: 'M',
    type: 'milestone',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function freshDb(): Database.Database {
  const db = openDb(':memory:')
  applySchema(db)
  return db
}

describe('fleet/lifecycle', () => {
  describe('createFleet', () => {
    let db: Database.Database
    let createdNames: string[]
    let fetched: string[]

    beforeEach(() => {
      db = freshDb()
      createdNames = []
      fetched = []
    })

    afterEach(() => {
      db.close()
    })

    async function run(bean: BeanRecord) {
      return createFleet(
        db,
        MS,
        {
          cwd: '/repo',
          primaryBranch: PRIMARY,
          project: {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK},
        },
        {
          createWorkspace(opts) {
            createdNames.push(`${opts.name}@${opts.base}`)
            return {path: `/wt/${opts.name}`, workspaceId: 'w-ms'}
          },
          fetchBean(id) {
            fetched.push(id)
            return bean
          },
        },
      )
    }

    it('validates the milestone, creates ms branch, registers the fleet active', async () => {
      const res = await run(milestoneBean())

      expect(fetched).to.deep.equal([MS])
      // one workspace creation, named after the milestone, based on primary
      expect(createdNames).to.deep.equal([`${MS}@${PRIMARY}`])
      // fleet row registered active
      const fleet = getFleet(db, PK, MS)
      expect(fleet?.status).to.equal('active')
      expect(fleet?.branch).to.equal(MS)
      expect(res).to.deep.equal({branch: MS})
    })

    it('refuses when the bean is not a milestone', async () => {
      let err: unknown
      try {
        await run(milestoneBean({type: 'task'}))
      } catch (error) {
        err = error
      }

      expect(err).to.be.instanceOf(FleetError)
      expect((err as FleetError).message).to.match(/not 'milestone'/)
      expect(getFleet(db, PK, MS)).to.be.undefined
      expect(createdNames).to.have.length(0)
    })

    it('refuses when an active fleet already exists', async () => {
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      // seed a prior active fleet row
      const {registerFleet} = await import('../../src/storage/fleets.js')
      registerFleet(db, {
        branch: MS,
        createdAt: '2026-01-01T00:00:00Z',
        milestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })

      let err: unknown
      try {
        await run(milestoneBean())
      } catch (error) {
        err = error
      }

      expect(err).to.be.instanceOf(FleetError)
      expect((err as FleetError).message).to.match(/already active/)
      expect(createdNames).to.have.length(0)
    })

    it('propagates adapter failures (recovery lives in the adapter now)', async () => {
      let err: unknown
      try {
        await createFleet(
          db,
          MS,
          {
            cwd: '/repo',
            primaryBranch: PRIMARY,
            project: {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK},
          },
          {
            createWorkspace() {
              throw new Error('workspace boom')
            },
            fetchBean() {
              return milestoneBean()
            },
          },
        )
      } catch (error) {
        err = error
      }

      expect((err as Error).message).to.match(/workspace boom/)
      expect(getFleet(db, PK, MS)).to.be.undefined
    })
  })

  describe('describeFleet', () => {
    let db: Database.Database

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: MS,
        createdAt: NOW,
        milestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })
    })

    afterEach(() => {
      db.close()
    })

    it('returns the fleet + its lanes', () => {
      addLane(db, {
        branch: 'epic-a',
        createdAt: NOW,
        currentTaskBeanId: 'task-1',
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: 'w1:p1',
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt/epic-a',
      })

      const snap = describeFleet(db, PK, MS)
      expect(snap.fleet.branch).to.equal(MS)
      expect(snap.lanes).to.have.length(1)
      expect(snap.lanes[0]!.epicBeanId).to.equal('epic-a')
      expect(snap.lanes[0]!.currentTaskBeanId).to.equal('task-1')
    })

    it('returns an empty lane list when none exist', () => {
      expect(describeFleet(db, PK, MS).lanes).to.deep.equal([])
    })

    it('throws FleetError when no fleet row exists', () => {
      let err: unknown
      try {
        describeFleet(db, PK, 'nope')
      } catch (error) {
        err = error
      }

      expect(err).to.be.instanceOf(FleetError)
      expect((err as FleetError).message).to.match(/no fleet for nope/)
    })
  })

  describe('finishFleet', () => {
    let db: Database.Database
    let vcsCalls: string[]
    let milestoneStatus: string
    let epicStatuses: Array<{id: string; status: string}>
    let mergeOutcome: MergeOutcome
    let spawnedMergers: Array<{conflictedFiles: string[]; cwd: string; mainRepoCwd: string}>

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: MS,
        createdAt: NOW,
        milestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })
      vcsCalls = []
      milestoneStatus = 'completed'
      epicStatuses = [
        {id: 'epic-1', status: 'completed'},
        {id: 'epic-2', status: 'completed'},
      ]
      mergeOutcome = {status: 'merged'}
      spawnedMergers = []
      // finishFleetTeardown toasts via herdr — silence it (no real client in tests).
      _setPaneShellForTesting(() => '')
    })

    afterEach(() => {
      db.close()
      _resetPaneShell()
    })

    /** Recording fake adapter: every op logs `name:detail` into vcsCalls. */
    function fakeVcs(): Vcs {
      return {
        commitPending() {
          vcsCalls.push('commitPending')
          return true
        },
        conflictedFiles() {
          return ['src/foo.ts']
        },
        createWorkspace() {
          return {path: '/x', workspaceId: 'w'}
        },
        deleteRef(o) {
          vcsCalls.push(`deleteRef:${o.name}:${o.cwd}`)
        },
        dirtyPaths() {
          return []
        },
        finalizeIntegration() {},
        findWorkspace() {
          return null
        },
        integrateHead() {
          return {status: 'merged'}
        },
        isCleanIgnoringBeans() {
          return true
        },
        isIntegrationSettled() {
          return true
        },
        kind: 'git',
        mergeHeadIntoRef(o) {
          vcsCalls.push(`merge:${o.ref}`)
          return mergeOutcome
        },
        projectKey(c) {
          return c
        },
        removeWorkspace(o) {
          vcsCalls.push(`removeWorkspace:${o.name}:${o.cwd}`)
        },
      }
    }

    function deps() {
      return {
        beanStatus(id: string) {
          return id === MS ? milestoneStatus : undefined
        },
        fetchEpicStatuses() {
          return epicStatuses
        },
        spawnMerger(opts: {conflictedFiles: string[]; cwd: string; mainRepoCwd: string}): string {
          spawnedMergers.push(opts)
          return 'mock-pane-1'
        },
        vcs: fakeVcs(),
      }
    }

    it('merges ms/<id> into primary and deletes rows when milestone + epics complete', () => {
      finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps())

      expect(vcsCalls.includes(`merge:${PRIMARY}`)).to.be.true
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('deletes the ms ref after a successful merge (cwd = main repo)', () => {
      finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps())

      expect(vcsCalls).to.include(`deleteRef:${MS}:/main`)
    })

    it('tears down the ms workspace after a successful merge (cwd = main repo)', () => {
      finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps())

      expect(vcsCalls).to.include(`removeWorkspace:${MS}:/main`)
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('refuses when the milestone bean is not completed', () => {
      milestoneStatus = 'in-progress'
      expect(() =>
        finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps()),
      ).to.throw(FleetError, /not completed/)
      expect(vcsCalls).to.have.length(0)
    })

    it('refuses when any epic is not completed', () => {
      epicStatuses = [
        {id: 'epic-1', status: 'completed'},
        {id: 'epic-2', status: 'in-progress'},
      ]
      expect(() =>
        finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps()),
      ).to.throw(FleetError, /not all epics/)
      expect(vcsCalls).to.have.length(0)
    })

    it('spawns a merger agent on conflict and sets fleet to merging', () => {
      mergeOutcome = {status: 'conflict'}
      const result = finishFleet(
        db,
        MS,
        {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK},
        deps(),
      )

      expect(result.merged).to.be.false
      expect(result.conflictPaneId).to.equal('mock-pane-1')
      expect(spawnedMergers).to.have.length(1)
      expect(spawnedMergers[0].conflictedFiles).to.deep.equal(['src/foo.ts'])
      // Fleet row stays, status = 'merging', pane stored for liveness tracking.
      const fleet = getFleet(db, PK, MS)!
      expect(fleet).to.exist
      expect(fleet.status).to.equal('merging')
      expect(fleet.paneId).to.equal('mock-pane-1')
      // Workspace + ref NOT removed on conflict.
      expect(vcsCalls.filter((c) => c.startsWith('removeWorkspace') || c.startsWith('deleteRef'))).to.deep.equal([])
    })

    it('refuses when no fleet row exists', () => {
      expect(() =>
        finishFleet(db, 'nope', {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps()),
      ).to.throw(FleetError, /no fleet for nope/)
    })

    it('hordr-hmbq: defensively commits pending beans writes BEFORE workspace removal', () => {
      finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps())

      const commitIdx = vcsCalls.indexOf('commitPending')
      const removeIdx = vcsCalls.indexOf(`removeWorkspace:${MS}:/main`)
      expect(commitIdx, 'a commitPending must fire').to.be.at.least(0)
      expect(removeIdx, 'a removeWorkspace must fire').to.be.at.least(0)
      expect(commitIdx, 'commit must come BEFORE removeWorkspace').to.be.below(removeIdx)
    })

    it('throws (no phantom merger) when the adapter aborts the merge — aborted, not a 0-file conflict', () => {
      // Reproduces the ms→primary bug class: a pre-merge failure (checkout
      // refused, dirty index — now guarded inside the adapter) must surface
      // as a hard FleetError, never as a conflict with 0 conflicted files.
      mergeOutcome = {message: 'uncommitted changes in /main', status: 'aborted'}

      expect(() =>
        finishFleet(db, MS, {cwd: '/repo', mainRepoCwd: '/main', primaryBranch: PRIMARY, projectKey: PK}, deps()),
      ).to.throw(FleetError, /merge aborted/)
      expect(spawnedMergers, 'no phantom merger agent').to.have.length(0)
      expect(vcsCalls.filter((c) => c.startsWith('removeWorkspace')), 'no teardown on abort').to.deep.equal([])
    })
  })

  describe('abortFleet', () => {
    let db: Database.Database
    let removedNames: string[]
    let discardedRefs: string[]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: MS,
        createdAt: NOW,
        milestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })
      addLane(db, {
        branch: 'epic-a',
        createdAt: NOW,
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt/epic-a',
      })
      removedNames = []
      discardedRefs = []
    })

    afterEach(() => {
      db.close()
    })

    function deps() {
      return {
        discardRef(o: {cwd: string; name: string}) {
          discardedRefs.push(o.name)
        },
        removeWorkspace(o: {cwd: string; name: string; path: string}) {
          removedNames.push(o.name)
        },
      }
    }

    it('keeps workspaces by default, deletes lane + fleet rows', () => {
      const res = abortFleet(db, MS, {cwd: '/repo', force: false, projectKey: PK}, deps())

      expect(res.worktreesRemoved).to.equal(0)
      expect(removedNames).to.have.length(0)
      expect(discardedRefs).to.have.length(0)
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('--force removes lane workspaces + ms workspace + ref, deletes rows', () => {
      const res = abortFleet(db, MS, {cwd: '/repo', force: true, projectKey: PK}, deps())

      expect(res.worktreesRemoved).to.equal(1)
      expect(removedNames).to.deep.equal(['epic-a', MS])
      expect(discardedRefs).to.deep.equal([MS])
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('refuses when no fleet row exists', () => {
      expect(() => abortFleet(db, 'nope', {cwd: '/repo', force: false, projectKey: PK}, deps())).to.throw(
        FleetError,
        /no fleet for nope/,
      )
    })
  })

  describe('resetLane', () => {
    let db: Database.Database
    let worktreeAlive: boolean
    let paneAlive: boolean
    let createdPanes: number
    let createdWorktrees: number

    const FLEET_ROW: FleetRow = {
      branch: MS,
      createdAt: NOW,
      milestoneBeanId: MS,
      paneId: null,
      projectKey: PK,
      status: 'active',
      worktreePath: '/wt/ms',
    }

    function laneByEpic(epicId: string) {
      return listLanes(db, PK, MS).find((l) => l.epicBeanId === epicId)!
    }

    function seedLane(
      overrides: Partial<{
        branch: string
        currentTaskBeanId: string
        epicBeanId: string
        paneId: string
        status: string
        workspaceId: string
        worktreePath: string
      }> = {},
    ): void {
      addLane(db, {
        branch: overrides.branch ?? 'epic-a',
        createdAt: NOW,
        currentTaskBeanId: overrides.currentTaskBeanId ?? 'task-1',
        epicBeanId: overrides.epicBeanId ?? 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: overrides.paneId ?? 'w1:p1',
        projectKey: PK,
        status: overrides.status ?? 'conflict',
        workspaceId: overrides.workspaceId ?? 'ws-a',
        worktreePath: overrides.worktreePath ?? '/wt/epic-a',
      })
    }

    function deps() {
      return {
        createPane() {
          createdPanes++
          return `w1:p${createdPanes + 10}`
        },
        createWorkspace() {
          createdWorktrees++
          return {path: '/wt/epic-a-new', workspaceId: 'ws-new'}
        },
        paneExists(id: string) {
          return paneAlive && id === 'w1:p1'
        },
        worktreeExists() {
          return worktreeAlive
        },
      }
    }

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, FLEET_ROW)
      worktreeAlive = true
      paneAlive = true
      createdPanes = 0
      createdWorktrees = 0
    })

    afterEach(() => {
      db.close()
    })

    it('reuses existing worktree + pane, clears task, sets active', () => {
      seedLane()

      const res = resetLane(db, laneByEpic('epic-a'), FLEET_ROW, deps())

      expect(res.worktreeCreated).to.equal(false)
      expect(res.paneCreated).to.equal(false)
      expect(createdWorktrees).to.equal(0)
      expect(createdPanes).to.equal(0)
      const lane = laneByEpic('epic-a')
      expect(lane.status).to.equal('active')
      expect(lane.currentTaskBeanId).to.equal(null)
    })

    it('recreates worktree when gone (create path)', () => {
      worktreeAlive = false
      seedLane()

      const res = resetLane(db, laneByEpic('epic-a'), FLEET_ROW, deps())

      expect(res.worktreeCreated).to.equal(true)
      expect(createdWorktrees).to.equal(1)
      const lane = laneByEpic('epic-a')
      expect(lane.status).to.equal('active')
      expect(lane.worktreePath).to.equal('/wt/epic-a-new')
    })

    it('creates new pane when pane is dead', () => {
      paneAlive = false
      seedLane()

      const res = resetLane(db, laneByEpic('epic-a'), FLEET_ROW, deps())

      expect(res.paneCreated).to.equal(true)
      expect(createdPanes).to.equal(1)
      const lane = laneByEpic('epic-a')
      expect(lane.paneId).to.equal('w1:p11')
    })

    it('creates pane when paneId is null', () => {
      seedLane({paneId: ''})

      const res = resetLane(db, laneByEpic('epic-a'), FLEET_ROW, deps())

      expect(res.paneCreated).to.equal(true)
      expect(createdPanes).to.equal(1)
    })
  })
})
