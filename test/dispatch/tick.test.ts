/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'

import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, listLanes, registerFleet, updateLaneStatus} from '../../src/storage/fleets.js'
import {createTestFleetEngine} from '../helpers/fleet-engine.js'

const PK = 'pk1'
const MS = 'ms1'
const NOW = '2026-07-09T00:00:00Z'
const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
}

function freshDb(): Database.Database {
  const db = openDb(':memory:')
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
  return db
}

describe('dispatch/tick (via FleetEngine.scanFleet)', () => {
  it('scans + creates a lane for an unblocked epic, then advances it (dispatch)', () => {
    const db = freshDb()
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
        epics: [{id: 'epic-a', title: 'Epic A'}],
      },
    })

    engine.scanFleet(db)

    const lanes = listLanes(db, PK, MS)
    expect(lanes).to.have.length(1)
    expect(lanes[0]!.epicBeanId).to.equal('epic-a')
    expect(lanes[0]!.status).to.equal('active')
    expect(lanes[0]!.currentTaskBeanId).to.equal('task-1')
    expect(records.spawn).to.have.length(1)

    db.close()
  })

  it('does not re-create a lane that already exists (scan skips it)', () => {
    const db = freshDb()
    const {engine, records} = createTestFleetEngine({
      config,
      data: {
        beans: {'epic-a': {status: 'todo', type: 'epic'}},
        dispatchable: {'epic-a': []},
        epics: [{id: 'epic-a', title: 'A'}],
      },
    })

    engine.scanFleet(db)
    engine.scanFleet(db) // second tick: epic-a already has a lane

    expect(records.createdWorktrees).to.have.length(1)
    expect(listLanes(db, PK, MS)).to.have.length(1)
    db.close()
  })

  it('skips lanes not in active status (conflict/done)', () => {
    const db = freshDb()
    addLane(db, {
      branch: 'ms1/epic-a',
      createdAt: NOW,
      currentTaskBeanId: 'task-1',
      epicBeanId: 'epic-a',
      fleetMilestoneBeanId: MS,
      paneId: 'w1:p1',
      projectKey: PK,
      status: 'active',
      workspaceId: 'w1',
      worktreePath: '/wt/epic-a',
    })
    updateLaneStatus(db, {epicId: 'epic-a', milestoneId: MS, projectKey: PK}, 'conflict')

    const {engine, records} = createTestFleetEngine({config})

    engine.scanFleet(db)

    expect(records.spawn).to.have.length(0)
    db.close()
  })

  it('ignores fleets that are not active', () => {
    const db = freshDb()
    db.prepare('UPDATE fleets SET status = ? WHERE milestone_bean_id = ?').run('finishable', MS)

    const {engine, records} = createTestFleetEngine({
      config,
      data: {epics: [{id: 'epic-a', title: 'A'}]},
    })

    engine.scanFleet(db)

    expect(records.createdWorktrees).to.have.length(0)
    db.close()
  })

  it('uses per-fleet cwd (engine internals scoped to fleet worktreePath)', () => {
    const db = freshDb()
    const {engine, records} = createTestFleetEngine({config})

    engine.scanFleet(db)

    expect(records.factoryCwds).to.include('/repo')
    db.close()
  })
})
