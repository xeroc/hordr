import Database from 'better-sqlite3'
import {expect} from 'chai'

import {applySchema, openDb} from '../../src/storage/db.js'
import {
  addLane,
  countActiveLanes,
  deleteFleet,
  deleteLanes,
  ensureProject,
  getFleet,
  getProjectPath,
  listLanes,
  registerFleet,
  setLanePane,
  updateLaneStatus,
} from '../../src/storage/fleets.js'

const NOW = '2026-07-09T00:00:00Z'
const PK = 'pk1'
const MS = 'hordr-ms1'

function freshDb(): Database.Database {
  const db = openDb(':memory:')
  applySchema(db)
  ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
  return db
}

function seedFleet(db: Database.Database): void {
  registerFleet(db, {
    branch: 'hordr-ms1',
    createdAt: NOW,
    milestoneBeanId: MS,
    projectKey: PK,
    status: 'active',
    worktreePath: '/wt/ms1',
  })
}

describe('storage/fleets', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('project', () => {
    it('ensureProject is idempotent (INSERT OR IGNORE)', () => {
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
      // registering twice does not throw and does not duplicate
      const count = db.prepare('SELECT COUNT(*) n FROM projects').get() as {n: number}
      expect(count.n).to.equal(1)
    })

    it('getProjectPath returns the beans_path stored by ensureProject', () => {
      expect(getProjectPath(db, PK)).to.equal('/b')
    })

    it('getProjectPath returns undefined for unknown projectKey', () => {
      expect(getProjectPath(db, 'unknown')).to.be.undefined
    })
  })

  describe('fleet', () => {
    it('registerFleet + getFleet round-trips', () => {
      registerFleet(db, {
        branch: 'hordr-ms1',
        createdAt: NOW,
        milestoneBeanId: MS,
        projectKey: PK,
        status: 'active',
        worktreePath: '/wt/ms1',
      })
      const got = getFleet(db, PK, MS)
      expect(got).to.deep.equal({
        branch: 'hordr-ms1',
        createdAt: NOW,
        milestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        worktreePath: '/wt/ms1',
      })
    })

    it('getFleet returns undefined when no row', () => {
      expect(getFleet(db, PK, 'nope')).to.be.undefined
    })

    it('registerFleet rejects duplicate (composite PK)', () => {
      registerFleet(db, {
        branch: 'hordr-ms1',
        createdAt: NOW,
        milestoneBeanId: MS,
        projectKey: PK,
        status: 'active',
        worktreePath: '/wt',
      })
      expect(() =>
        registerFleet(db, {
          branch: 'ms/x',
          createdAt: NOW,
          milestoneBeanId: MS,
          projectKey: PK,
          status: 'active',
          worktreePath: '/wt2',
        }),
      ).to.throw()
    })

    it('deleteFleet removes the row', () => {
      registerFleet(db, {
        branch: 'hordr-ms1',
        createdAt: NOW,
        milestoneBeanId: MS,
        projectKey: PK,
        status: 'active',
        worktreePath: '/wt',
      })
      deleteFleet(db, PK, MS)
      expect(getFleet(db, PK, MS)).to.be.undefined
    })
  })

  describe('lane', () => {
    it('addLane + listLanes round-trips, ordered by created_at', () => {
      seedFleet(db)
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
      addLane(db, {
        branch: 'epic-b',
        createdAt: '2026-07-09T00:00:01Z',
        currentTaskBeanId: 'task-1',
        epicBeanId: 'epic-b',
        fleetMilestoneBeanId: MS,
        paneId: 'w1:p1',
        projectKey: PK,
        status: 'pending',
        workspaceId: null,
        worktreePath: '/wt/epic-b',
      })

      const lanes = listLanes(db, PK, MS)
      expect(lanes).to.have.length(2)
      expect(lanes[0]!.epicBeanId).to.equal('epic-a')
      expect(lanes[1]!.epicBeanId).to.equal('epic-b')
      expect(lanes[1]!.currentTaskBeanId).to.equal('task-1')
      expect(lanes[1]!.paneId).to.equal('w1:p1')
    })

    it('deleteLanes removes all lanes for the fleet', () => {
      seedFleet(db)
      addLane(db, {
        branch: 'b1',
        createdAt: NOW,
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt',
      })
      deleteLanes(db, PK, MS)
      expect(listLanes(db, PK, MS)).to.have.length(0)
    })

    it('updateLaneStatus changes a lane status', () => {
      seedFleet(db)
      addLane(db, {
        branch: 'b1',
        createdAt: NOW,
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt',
      })
      updateLaneStatus(db, {epicId: 'epic-a', milestoneId: MS, projectKey: PK}, 'merging')
      expect(listLanes(db, PK, MS)[0]!.status).to.equal('merging')
    })

    it('setLanePane records the stable pane id', () => {
      seedFleet(db)
      addLane(db, {
        branch: 'b1',
        createdAt: NOW,
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt',
      })
      setLanePane(db, {epicId: 'epic-a', milestoneId: MS, projectKey: PK}, 'w1:p1')
      expect(listLanes(db, PK, MS)[0]!.paneId).to.equal('w1:p1')
    })

    it('countActiveLanes counts in-flight lanes across all projects/fleets (excludes idle)', () => {
      // second project + fleet so we prove the count is global, not per-fleet
      ensureProject(db, {beansPath: '/b2', companyPath: null, configPath: '/c2', projectKey: 'pk2'})
      registerFleet(db, {
        branch: 'ms/ms2',
        createdAt: NOW,
        milestoneBeanId: 'hordr-ms2',
        projectKey: 'pk2',
        status: 'active',
        worktreePath: '/wt-ms2',
      })
      seedFleet(db) // pk1 / hordr-ms1

      // pk1/ms1: one in-flight, one idle
      addLane(db, {
        branch: 'a',
        createdAt: NOW,
        currentTaskBeanId: 't1',
        epicBeanId: 'e1',
        fleetMilestoneBeanId: MS,
        paneId: 'p',
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt',
      })
      addLane(db, {
        branch: 'b',
        createdAt: NOW,
        currentTaskBeanId: null,
        epicBeanId: 'e2',
        fleetMilestoneBeanId: MS,
        paneId: null,
        projectKey: PK,
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt2',
      })
      // pk2/ms2: one in-flight
      addLane(db, {
        branch: 'c',
        createdAt: NOW,
        currentTaskBeanId: 't2',
        epicBeanId: 'e3',
        fleetMilestoneBeanId: 'hordr-ms2',
        paneId: 'p2',
        projectKey: 'pk2',
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt3',
      })

      // t1 (pk1) + t2 (pk2); the idle e2 lane is excluded
      expect(countActiveLanes(db)).to.equal(2)
    })
  })
})
