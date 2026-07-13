/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'
import type {FleetRow, LaneRow} from '../../src/storage/fleets.js'

import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, listLanes, registerFleet} from '../../src/storage/fleets.js'
import {createTestFleetEngine} from '../helpers/fleet-engine.js'

const PK = 'pk1'
const MS = 'ms1'
const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
  worktree_branch_prefix: 'bean/',
}

const FLEET: FleetRow = {
  branch: 'ms1',
  createdAt: '2026-01-01T00:00:00Z',
  milestoneBeanId: MS,
  projectKey: PK,
  status: 'active',
  worktreePath: '/repo',
}

function lane(overrides: Partial<LaneRow> = {}): LaneRow {
  return {
    branch: 'ms1/epic-a',
    createdAt: '2026-01-01T00:00:00Z',
    currentTaskBeanId: null,
    epicBeanId: 'epic-a',
    fleetMilestoneBeanId: MS,
    paneId: 'w1:p1',
    projectKey: PK,
    status: 'active',
    workspaceId: 'w1',
    worktreePath: '/wt/epic-a',
    ...overrides,
  }
}

/** Register fleet + lane so DB mutations (setLaneCurrentTask, updateLaneStatus) take effect. */
function freshDbWithLane(laneOverrides: Partial<LaneRow> = {}): Database.Database {
  const db = openDb(':memory:')
  applySchema(db)
  ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: PK})
  registerFleet(db, FLEET)
  addLane(db, lane(laneOverrides))
  return db
}

/** Read the lane back from the DB to verify mutations. */
function dbLane(db: Database.Database): LaneRow {
  return listLanes(db, PK, MS)[0]!
}

describe('dispatch/advance (via FleetEngine.advanceLane)', () => {
  it('idle + ready work → dispatches next task, sets currentTask', () => {
    const db = freshDbWithLane()
    const {engine, records} = createTestFleetEngine({
      config,
      data: {
        beans: {
          'epic-a': {status: 'todo', type: 'epic'},
          'task-1': {assigned: 'implementer', status: 'todo', type: 'task'},
        },
        dispatchable: {
          'epic-a': [{assigned: 'implementer', id: 'task-1', priority: 'normal', title: 'T1', type: 'task'}],
        },
      },
    })

    const res = engine.advanceLane(db, FLEET, lane())

    expect(res.action).to.equal('dispatched')
    expect(res.taskId).to.equal('task-1')
    expect(records.spawn).to.have.length(1)
    expect(dbLane(db).currentTaskBeanId).to.equal('task-1')
    db.close()
  })

  it('idle + no ready work → idle (no spawn)', () => {
    const db = freshDbWithLane()
    const {engine, records} = createTestFleetEngine({config})

    const res = engine.advanceLane(db, FLEET, lane())

    expect(res.action).to.equal('idle')
    expect(records.spawn).to.have.length(0)
    db.close()
  })

  it('active + task not done + pane alive → wait', () => {
    const db = freshDbWithLane({currentTaskBeanId: 'task-1'})
    const {engine} = createTestFleetEngine({
      behavior: {defaultBeanStatus: 'in-progress', paneAlive: true},
      config,
    })

    const res = engine.advanceLane(db, FLEET, lane({currentTaskBeanId: 'task-1'}))

    expect(res.action).to.equal('wait')
    db.close()
  })

  it('active + pane gone + task not done → blocked, lane flips to conflict', () => {
    const db = freshDbWithLane({currentTaskBeanId: 'task-1'})
    const {engine} = createTestFleetEngine({
      behavior: {defaultBeanStatus: 'in-progress', paneAlive: false},
      config,
    })

    const res = engine.advanceLane(db, FLEET, lane({currentTaskBeanId: 'task-1'}))

    expect(res.action).to.equal('blocked')
    expect(dbLane(db).status).to.equal('conflict')
    db.close()
  })

  it('proceed + epic NOT yet completed → rollup, free lane (currentTask cleared)', () => {
    const db = freshDbWithLane({currentTaskBeanId: 'task-1'})
    const {engine, records} = createTestFleetEngine({
      config,
      data: {
        ancestry: [{descendantsAllCompleted: false, id: 'epic-a', status: 'todo'}],
        beans: {
          'epic-a': {status: 'todo', type: 'epic'},
          'task-1': {assigned: 'implementer', status: 'completed', type: 'task'},
        },
      },
    })

    const res = engine.advanceLane(db, FLEET, lane({currentTaskBeanId: 'task-1'}))

    expect(res.action).to.equal('wait')
    expect(records.markedCompleted).to.deep.equal([])
    expect(dbLane(db).currentTaskBeanId).to.equal(null)
    expect(records.merge).to.have.length(0)
    db.close()
  })

  it('proceed + epic completed → merge lane into ms, remove worktree, lane done', () => {
    const db = freshDbWithLane({currentTaskBeanId: 'task-1'})
    const {engine, records} = createTestFleetEngine({
      config,
      data: {
        ancestry: [{descendantsAllCompleted: true, id: 'epic-a', status: 'todo'}],
        beans: {
          'epic-a': {status: 'completed', type: 'epic'},
          'task-1': {assigned: 'implementer', status: 'completed', type: 'task'},
        },
      },
    })

    const res = engine.advanceLane(db, FLEET, lane({currentTaskBeanId: 'task-1'}))

    expect(res.action).to.equal('epic-completed')
    expect(records.markedCompleted).to.deep.equal(['epic-a'])
    expect(records.merge).to.deep.equal([{cwd: '/repo', source: 'ms1/epic-a', target: 'ms1'}])
    expect(records.removedWorktrees).to.deep.equal(['ms1/epic-a'])
    expect(dbLane(db).status).to.equal('done')
    expect(dbLane(db).currentTaskBeanId).to.equal(null)
    db.close()
  })

  it('proceed + epic completed + merge conflict → lane conflict, worktree kept', () => {
    const db = freshDbWithLane({currentTaskBeanId: 'task-1'})
    const {engine, records} = createTestFleetEngine({
      behavior: {mergeConflict: true},
      config,
      data: {
        ancestry: [{descendantsAllCompleted: true, id: 'epic-a', status: 'todo'}],
        beans: {
          'epic-a': {status: 'completed', type: 'epic'},
          'task-1': {assigned: 'implementer', status: 'completed', type: 'task'},
        },
      },
    })

    const res = engine.advanceLane(db, FLEET, lane({currentTaskBeanId: 'task-1'}))

    expect(res.action).to.equal('blocked')
    expect(dbLane(db).status).to.equal('conflict')
    expect(records.removedWorktrees).to.have.length(0)
    db.close()
  })
})
