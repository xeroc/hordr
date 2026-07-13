/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {HordrConfig} from '../../src/config/schema.js'

import {tick} from '../../src/dispatch/tick.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, listLanes, registerFleet, updateLaneStatus} from '../../src/storage/fleets.js'

const PK = 'pk1'
const MS = 'ms1'
const NOW = '2026-07-09T00:00:00Z'
const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  primary_branch: 'develop',
  worktree_branch_prefix: 'bean/',
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

describe('dispatch/tick', () => {
  it('scans + creates a lane for an unblocked epic, then advances it (dispatch)', () => {
    const db = freshDb()
    const spawnCalls: string[] = []

    tick(db, () => ({
      beanStatus: () => "todo",
      commitBeans() {},
      config,
      createPane: () => 'w1:p1',
      createWorktree: () => ({path: '/wt/epic-a', workspaceId: 'w1'}),
      epicStatus: () => 'todo',
      fetchAncestry: () => [],
      fetchBean: (id) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
      fetchDispatchable: () => [{assigned: 'implementer', id: 'task-1', priority: 'normal', title: 'T1', type: 'task'}],
      fetchEpics: () => [{id: 'epic-a', title: 'Epic A'}],
      hasReadyWork: () => true,
      markCompleted() {},
      mergeBranch: () => ({conflict: false}),
      paneAlive: () => true,
      removeWorktree() {},
      spawn(opts) {
        spawnCalls.push(opts.prompt)
      },
      worktreeExists: () => true,
    }))

    // lane created
    const lanes = listLanes(db, PK, MS)
    expect(lanes).to.have.length(1)
    expect(lanes[0]!.epicBeanId).to.equal('epic-a')
    expect(lanes[0]!.status).to.equal('active')
    // dispatched: current task set + spawn called
    expect(lanes[0]!.currentTaskBeanId).to.equal('task-1')
    expect(spawnCalls).to.have.length(1)

    db.close()
  })

  it('does not re-create a lane that already exists (scan skips it)', () => {
    const db = freshDb()
    let wtCalls = 0

    const factory = () => ({
      beanStatus: () => "todo",
      commitBeans() {},
      config,
      createPane: () => 'p',
      createWorktree() {
        wtCalls++
        return {path: '/wt', workspaceId: 'w'}
      },
      epicStatus: () => 'todo',
      fetchAncestry: () => [],
      fetchBean: (id: string) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
      fetchDispatchable: () => [],
      fetchEpics: () => [{id: 'epic-a', title: 'A'}],
      hasReadyWork: () => true,
      markCompleted() {},
      mergeBranch: () => ({conflict: false}),
      paneAlive: () => true,
      removeWorktree() {},
      spawn() {},
      worktreeExists: () => true,
    })

    tick(db, factory as never)
    tick(db, factory as never) // second tick: epic-a already has a lane

    expect(wtCalls).to.equal(1) // worktree created only once
    expect(listLanes(db, PK, MS)).to.have.length(1)
    db.close()
  })

  it('skips lanes not in active status (conflict/done)', () => {
    const db = freshDb()
    // seed a conflict lane directly
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

    let spawnCalls = 0
    tick(db, () => ({
      beanStatus: () => "todo",
      commitBeans() {},
      config,
      createPane: () => 'p',
      createWorktree: () => ({path: '/wt', workspaceId: 'w'}),
      epicStatus: () => 'todo',
      fetchAncestry: () => [],
      fetchBean: (id: string) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
      fetchDispatchable: () => [{assigned: 'implementer', id: 'task-9', priority: 'normal', title: 'T9', type: 'task'}],
      fetchEpics: () => [],
      hasReadyWork: () => true,
      markCompleted() {},
      mergeBranch: () => ({conflict: false}),
      paneAlive: () => true,
      removeWorktree() {},
      spawn() {
        spawnCalls++
      },
      worktreeExists: () => true,
    }))

    // conflict lane not advanced
    expect(spawnCalls).to.equal(0)
    db.close()
  })

  it('ignores fleets that are not active', () => {
    const db = freshDb()
    // flip the fleet to a non-active status
    db.prepare('UPDATE fleets SET status = ? WHERE milestone_bean_id = ?').run('finishable', MS)

    let wtCalls = 0
    tick(db, () => ({
      beanStatus: () => "todo",
      commitBeans() {},
      config,
      createPane: () => 'p',
      createWorktree() {
        wtCalls++
        return {path: '/wt', workspaceId: 'w'}
      },
      epicStatus: () => 'todo',
      fetchAncestry: () => [],
      fetchBean: (id: string) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
      fetchDispatchable: () => [],
      fetchEpics: () => [{id: 'epic-a', title: 'A'}],
      hasReadyWork: () => true,
      markCompleted() {},
      mergeBranch: () => ({conflict: false}),
      paneAlive: () => true,
      removeWorktree() {},
      spawn() {},
      worktreeExists: () => true,
    }))

    expect(wtCalls).to.equal(0)
    db.close()
  })

  it('uses per-fleet cwd (factory called with fleet worktreePath)', () => {
    const db = freshDb()
    const seenCwds: string[] = []

    tick(db, (cwd) => {
      seenCwds.push(cwd)
      return {
        beanStatus: () => "todo",
      commitBeans() {},
      config,
        createPane: () => 'p',
        createWorktree: () => ({path: '/wt', workspaceId: 'w'}),
        epicStatus: () => 'todo',
        fetchAncestry: () => [],
        fetchBean: (id: string) => ({assigned: 'implementer', body: 'b', id, type: 'task'}) as never,
        fetchDispatchable: () => [],
        fetchEpics: () => [],
        hasReadyWork: () => false,
        markCompleted() {},
        mergeBranch: () => ({conflict: false}),
        paneAlive: () => true,
        removeWorktree() {},
        spawn() {},
        worktreeExists: () => true,
      }
    })

    // factory called with the fleet's worktreePath ('/repo' from freshDb)
    expect(seenCwds).to.include('/repo')
    db.close()
  })
})
