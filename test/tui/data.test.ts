import Database from 'better-sqlite3'
import {expect} from 'chai'

import {applySchema} from '../../src/storage/db.js'
import {addLane, ensureProject, registerFleet} from '../../src/storage/fleets.js'
import {readFleetList} from '../../src/tui/data.js'

describe('tui/data', () => {
  it('readFleetList returns view-model items with per-fleet lane counts', () => {
    const db = new Database(':memory:')
    applySchema(db)
    ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
    registerFleet(db, {
      branch: 'ms/ms1',
      createdAt: '',
      milestoneBeanId: 'ms1',
      projectKey: 'pk1',
      status: 'active',
      worktreePath: '/wt',
    })
    addLane(db, {
      branch: 'e1',
      createdAt: '',
      currentTaskBeanId: null,
      epicBeanId: 'e1',
      fleetMilestoneBeanId: 'ms1',
      paneId: null,
      projectKey: 'pk1',
      status: 'active',
      workspaceId: null,
      worktreePath: '/wt',
    })
    addLane(db, {
      branch: 'e2',
      createdAt: '',
      currentTaskBeanId: 't',
      epicBeanId: 'e2',
      fleetMilestoneBeanId: 'ms1',
      paneId: 'p',
      projectKey: 'pk1',
      status: 'merging',
      workspaceId: null,
      worktreePath: '/wt2',
    })

    const items = readFleetList(db)
    expect(items).to.have.length(1)
    expect(items[0]!.milestone).to.equal('ms1')
    expect(items[0]!.laneCount).to.equal(2)
    db.close()
  })

  it('readFleetList returns [] when there are no fleets', () => {
    const db = new Database(':memory:')
    applySchema(db)
    expect(readFleetList(db)).to.deep.equal([])
    db.close()
  })
})
