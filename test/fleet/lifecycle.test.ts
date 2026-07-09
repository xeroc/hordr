/* eslint-disable camelcase -- BeanRecord mirrors the on-disk snake_case contract */
import Database from 'better-sqlite3'
import {expect} from 'chai'

import type {BeanRecord} from '../../src/beans/client.js'

import {createFleet, FleetError} from '../../src/fleet/lifecycle.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {ensureProject, getFleet} from '../../src/storage/fleets.js'

const PK = 'pk1'
const MS = 'hordr-ms1'
const PRIMARY = 'develop'

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

describe('fleet/lifecycle createFleet', () => {
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
