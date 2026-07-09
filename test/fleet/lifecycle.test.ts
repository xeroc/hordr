/* eslint-disable camelcase -- BeanRecord mirrors the on-disk snake_case contract */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'

import {createFleet, describeFleet, finishFleet, FleetError} from '../../src/fleet/lifecycle.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, getFleet, registerFleet} from '../../src/storage/fleets.js'

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
    let daemonStarted: boolean
    let fetched: string[]

    beforeEach(() => {
      db = freshDb()
      gitCalls = []
      daemonStarted = false
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
          ensureDaemon: async () => ({started: daemonStarted}),
          fetchBean(id) {
            fetched.push(id)
            return bean
          },
          git(args, opts) {
            gitCalls.push({args, cwd: opts.cwd})
          },
        },
      )
    }

    it('validates the milestone, creates ms branch, registers fleet, ensures daemon', async () => {
      daemonStarted = true
      const res = await run(milestoneBean())

      expect(fetched).to.deep.equal([MS])
      // ms branch created from primary
      expect(gitCalls).to.have.length(1)
      expect(gitCalls[0]!.args).to.deep.equal(['branch', `ms/${MS}`, PRIMARY])
      expect(gitCalls[0]!.cwd).to.equal('/repo')
      // fleet row registered active
      const fleet = getFleet(db, PK, MS)
      expect(fleet?.status).to.equal('active')
      expect(fleet?.branch).to.equal(`ms/${MS}`)
      expect(res).to.deep.equal({branch: `ms/${MS}`, daemonStarted: true})
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
        branch: `ms/${MS}`,
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
  })

  describe('describeFleet', () => {
    let db: Database.Database

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: `ms/${MS}`,
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
        branch: 'ms/hordr-ms1/epic-a',
        createdAt: NOW,
        currentTaskBeanId: 'task-1',
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: 'w1:p1',
        projectKey: PK,
        status: 'active',
        worktreePath: '/wt/epic-a',
      })

      const snap = describeFleet(db, PK, MS)
      expect(snap.fleet.branch).to.equal(`ms/${MS}`)
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

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      registerFleet(db, {
        branch: `ms/${MS}`,
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
    })

    afterEach(() => {
      db.close()
    })

    function deps() {
      return {
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
      }
    }

    it('merges ms/<id> into primary and deletes rows when milestone + epics complete', () => {
      finishFleet(db, MS, {cwd: '/repo', primaryBranch: PRIMARY, projectKey: PK}, deps())

      expect(gitCalls).to.have.length(2)
      expect(gitCalls[0]!.args).to.deep.equal(['checkout', PRIMARY])
      expect(gitCalls[1]!.args).to.deep.equal(['merge', '--no-ff', `ms/${MS}`])
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
  })
})
