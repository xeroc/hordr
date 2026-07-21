/* eslint-disable camelcase -- BeanRecord mirrors the on-disk snake_case contract */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'

import {abortFleet, createFleet, describeFleet, finishFleet, FleetError, resetLane} from '../../src/fleet/lifecycle.js'
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
    let gitCalls: Array<{args: string[]; cwd: string}>
    let fetched: string[]

    beforeEach(() => {
      db = freshDb()
      gitCalls = []
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
          createWorktree: (opts) => ({path: `/wt/${opts.branch}`, workspaceId: 'w-ms'}),
          fetchBean(id) {
            fetched.push(id)
            return bean
          },
          git(args, opts) {
            gitCalls.push({args, cwd: opts.cwd})
          },
          openWorktree: (opts) => ({path: `/wt/${opts.branch}`, workspaceId: 'w-ms'}),
        },
      )
    }

    it('validates the milestone, creates ms branch, registers the fleet active', async () => {
      const res = await run(milestoneBean())

      expect(fetched).to.deep.equal([MS])
      // no git calls — herdr worktree create handles branch + worktree
      expect(gitCalls).to.have.length(0)
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
      expect(gitCalls).to.have.length(0)
    })

    it('refuses when an active fleet already exists', async () => {
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      // seed a prior active fleet row
      const {registerFleet} = await import('../../src/storage/fleets.js')
      registerFleet(db, {
        branch: MS,
        createdAt: '2026-01-01T00:00:00Z',
        milestoneBeanId: MS,
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
      expect(gitCalls).to.have.length(0)
    })

    it('falls back to openWorktree when createWorktree reports already exists', async () => {
      let createAttempts = 0
      const result = await createFleet(
        db,
        MS,
        {
          cwd: '/repo',
          primaryBranch: PRIMARY,
          project: {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK},
        },
        {
          createWorktree() {
            createAttempts++
            throw new Error('branch already exists')
          },
          fetchBean() {
            return milestoneBean()
          },
          git() {},
          openWorktree() {
            return {path: '/wt/recovered', workspaceId: 'w-recovered'}
          },
        },
      )

      expect(createAttempts).to.equal(1)
      expect(result).to.deep.equal({branch: MS})
      const fleet = getFleet(db, PK, MS)
      expect(fleet?.worktreePath).to.equal('/wt/recovered')
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
    let gitCalls: Array<{args: string[]; cwd: string}>
    let milestoneStatus: string
    let epicStatuses: Array<{id: string; status: string}>
    let gitThrows: boolean
    let removedWorktrees: string[]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: MS,
        createdAt: NOW,
        milestoneBeanId: MS,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })
      gitCalls = []
      milestoneStatus = 'completed'
      epicStatuses = [
        {id: 'epic-1', status: 'completed'},
        {id: 'epic-2', status: 'completed'},
      ]
      gitThrows = false
      removedWorktrees = []
    })

    afterEach(() => {
      db.close()
    })

    function deps() {
      return {
        beansDir(_worktreePath: string) {
          return '.beans'
        },
        beanStatus(id: string) {
          return id === MS ? milestoneStatus : undefined
        },
        fetchEpicStatuses() {
          return epicStatuses
        },
        git(args: string[], opts: {cwd: string}): void {
          if (gitThrows) throw new Error('merge conflict')
          gitCalls.push({args, cwd: opts.cwd})
        },
        removeWorktree(worktreePath: string): void {
          removedWorktrees.push(worktreePath)
        },
      }
    }

    it('merges ms/<id> into primary and deletes rows when milestone + epics complete', () => {
      finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())

      expect(gitCalls.some((c) => c.args[0] === 'merge' && c.args.includes('hordr-ms1'))).to.be.true
      // merge now stashes first — check by content not position

      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('tears down the ms worktree after a successful merge', () => {
      finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())

      // removeWorktree now receives the worktree PATH (not the branch) — the
      // new contract mirrors git worktree remove <path>.
      expect(removedWorktrees).to.deep.equal(['/repo'])
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('refuses when the milestone bean is not completed', () => {
      milestoneStatus = 'in-progress'
      expect(() => finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())).to.throw(
        FleetError,
        /not completed/,
      )
      expect(gitCalls).to.have.length(0)
    })

    it('refuses when any epic is not completed', () => {
      epicStatuses = [
        {id: 'epic-1', status: 'completed'},
        {id: 'epic-2', status: 'in-progress'},
      ]
      expect(() => finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())).to.throw(
        FleetError,
        /not all epics/,
      )
      expect(gitCalls).to.have.length(0)
    })

    it('throws on merge conflict and keeps the fleet row', () => {
      gitThrows = true
      expect(() => finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())).to.throw(
        FleetError,
        /conflicted/,
      )
      expect(getFleet(db, PK, MS)).to.exist
    })

    it('refuses when no fleet row exists', () => {
      expect(() => finishFleet(db, 'nope', {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())).to.throw(
        FleetError,
        /no fleet for nope/,
      )
    })

    it('hordr-hmbq: defensively commits .beans/ writes before worktree removal — mops straggler rollup dirt', () => {
      // git diff --cached --quiet throws (exit 1) → something staged → commit must run.
      // Then removeWorktree. The defensive commit must come BEFORE the remove call,
      // so straggler .beans/ dirt doesn't make `git worktree remove` refuse.
      let commitCallSeen = false
      let removeCallSeen = false
      let commitBeforeRemove: boolean | null = null
      const orderedDeps = {
        ...deps(),
        git(args: string[], opts: {cwd: string}): void {
          gitCalls.push({args, cwd: opts.cwd})
          if (args[0] === 'add' || args[0] === 'commit' || (args[0] === 'diff' && args[1] === '--cached')) {
            // pretend there's always staged dirt so the commit branch fires
            if (args[0] === 'commit') commitCallSeen = true
            if (commitCallSeen && !removeCallSeen) commitBeforeRemove = true
          }
        },
        removeWorktree(worktreePath: string): void {
          removeCallSeen = true
          removedWorktrees.push(worktreePath)
        },
      }
      // override the diff to "throw" so commit branch fires (idempotent skip not exercised here)
      const origGit = orderedDeps.git
      orderedDeps.git = (args: string[], opts: {cwd: string}) => {
        if (args[0] === 'diff' && args[1] === '--cached') {
          gitCalls.push({args, cwd: opts.cwd})
          throw new Error('exit 1 = staged diffs')
        }

        origGit(args, opts)
      }

      finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, orderedDeps)

      // The defensive commit fired (add + diff --cached --quiet + commit, in order).
      expect(gitCalls.some((c) => c.args[0] === 'add' && c.args[1] === '.beans')).to.be.true
      expect(commitCallSeen, 'a chore(beans) commit must fire before removeWorktree').to.be.true
      expect(commitBeforeRemove, 'commit must come BEFORE removeWorktree').to.equal(true)
      expect(removedWorktrees).to.deep.equal(['/repo'])
    })

    it('hordr-hmbq: when .beans/ has nothing staged, the defensive commit is skipped (idempotent) and remove still runs', () => {
      // git diff --cached --quiet succeeds (exit 0) → nothing staged → no commit call.
      const orderedDeps = {
        ...deps(),
        // default git returns void for everything → diff succeeds → idempotent skip
      }

      finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, orderedDeps)

      expect(
        gitCalls.some((c) => c.args[0] === 'commit'),
        'no commit when nothing staged',
      ).to.be.false
      expect(removedWorktrees).to.deep.equal(['/repo'])
    })
  })

  describe('abortFleet', () => {
    let db: Database.Database
    let gitCalls: string[][]
    let removedBranches: string[]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: MS,
        createdAt: NOW,
        milestoneBeanId: MS,
        projectKey: PK,
        status: 'active',
        worktreePath: '/repo',
      })
      addLane(db, {
        branch: 'ms/x/epic-a',
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
      gitCalls = []
      removedBranches = []
    })

    afterEach(() => {
      db.close()
    })

    it('keeps worktrees by default, deletes lane + fleet rows', () => {
      const res = abortFleet(
        db,
        MS,
        {cwd: '/repo', force: false, projectKey: PK},
        {
          git(args) {
            gitCalls.push(args)
          },
          removeWorktree(branch) {
            removedBranches.push(branch)
          },
        },
      )

      expect(res.worktreesRemoved).to.equal(0)
      expect(removedBranches).to.have.length(0)
      expect(gitCalls).to.have.length(0)
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('--force removes lane worktrees + ms branch, deletes rows', () => {
      const res = abortFleet(
        db,
        MS,
        {cwd: '/repo', force: true, projectKey: PK},
        {
          git(args) {
            gitCalls.push(args)
          },
          removeWorktree(branch) {
            removedBranches.push(branch)
          },
        },
      )

      expect(res.worktreesRemoved).to.equal(1)
      expect(removedBranches).to.deep.equal(['ms/x/epic-a', MS])
      expect(gitCalls).to.deep.equal([['branch', '-D', MS]])
      expect(getFleet(db, PK, MS)).to.be.undefined
    })

    it('refuses when no fleet row exists', () => {
      expect(() =>
        abortFleet(db, 'nope', {cwd: '/repo', force: false, projectKey: PK}, {git() {}, removeWorktree() {}}),
      ).to.throw(FleetError, /no fleet for nope/)
    })
  })

  describe('resetLane', () => {
    let db: Database.Database
    let worktreeAlive: boolean
    let paneAlive: boolean
    let createdPanes: number
    let createdWorktrees: number
    let openedWorktrees: number

    const FLEET_ROW: FleetRow = {
      branch: MS,
      createdAt: NOW,
      milestoneBeanId: MS,
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
        createWorktree() {
          createdWorktrees++
          return {path: '/wt/epic-a-new', workspaceId: 'ws-new'}
        },
        openWorktree() {
          openedWorktrees++
          return {path: '/wt/epic-a', workspaceId: 'ws-a'}
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
      openedWorktrees = 0
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

    it('falls back to openWorktree when create reports already exists', () => {
      worktreeAlive = false
      seedLane()

      const res = resetLane(db, laneByEpic('epic-a'), FLEET_ROW, {
        ...deps(),
        createWorktree() {
          createdWorktrees++
          throw new Error('branch already exists')
        },
      })

      expect(res.worktreeCreated).to.equal(true)
      expect(createdWorktrees).to.equal(1)
      expect(openedWorktrees).to.equal(1)
      const lane = laneByEpic('epic-a')
      expect(lane.worktreePath).to.equal('/wt/epic-a')
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
