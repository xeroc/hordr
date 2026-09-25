/* eslint-disable camelcase -- HordrConfig fields mirror the snake_case config */
import Database from 'better-sqlite3'
import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {HordrConfig} from '../../src/config/schema.js'
import type {Vcs} from '../../src/vcs/types.js'

import {
  _resetShell as _resetBeansShell,
  _setShellForTesting as _setBeansShell,
  type ShellFn as BeansShellFn,
} from '../../src/beans/client.js'
import {_resetShell, _setShellForTesting, type ShellFn} from '../../src/dispatch/dispatch.js'
import {createFleetEngine, type FleetEngine} from '../../src/dispatch/engine.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShellForTesting} from '../../src/herdr/pane.js'
import {
  _resetGit as _resetWtGit,
  _resetShell as _resetWtShell,
  _setGitForTesting as _setWtGitForTesting,
  _setShellForTesting as _setWtShellForTesting,
  type GitShellFn as WtGitShellFn,
  type ShellFn as WtShellFn,
} from '../../src/herdr/worktree.js'
import {_resetGitRunner, _setGitRunnerForTesting, type GitRunner} from '../../src/runtime.js'
import {applySchema, openDb} from '../../src/storage/db.js'
import {addLane, ensureProject, getFleet, listLanes, registerFleet} from '../../src/storage/fleets.js'
import {_resetShell as _resetJjShell, _setShellForTesting as _setJjShell} from '../../src/vcs/jj-vcs.js'
import {_setVcsForTesting} from '../../src/vcs/resolve.js'

const config: HordrConfig = {
  agents: {implementer: {harness: 'opencode', persona: 'impl'}},
  default_harness: 'opencode',
  default_vcs: 'git' as const,
}

// getDispatchable (dispatch.ts) calls the shell twice: a `beans query` (subtree)
// and a `beans list --ready` (ready set). Mock both to report one ready task.
function shellWithReadyWork(): ShellFn {
  return ((args: string[]) => {
    if (args[0] === 'list') {
      return JSON.stringify([{id: 'task-idle', priority: 'normal', status: 'todo', title: 'Idle Task', type: 'task'}])
    }

    return JSON.stringify({
      bean: {children: [{id: 'task-idle', priority: 'normal', title: 'Idle Task', type: 'task'}]},
    })
  }) as ShellFn
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
      // Milestone-completion sweep (hordr-45f3) calls getBean(ms) — mock it
      // as 'completed' so the sweep's precondition fails and it skips.
      _setBeansShell(((_cmd: string, _args: string[]) =>
        JSON.stringify({
          body: '',
          created_at: '',
          etag: 'e1',
          id: 'healthy-ms',
          path: 'p',
          priority: 'normal',
          slug: 'healthy-ms',
          status: 'completed',
          title: 'Healthy',
          type: 'milestone',
          updated_at: '',
        })) as unknown as BeansShellFn)

      const engine = createFleetEngine(config)

      expect(() => engine.scanFleet(db)).to.not.throw()

      expect(getFleet(db, 'pk1', 'broken-ms')!.status).to.equal('broken')
      // The healthy fleet's worktree cwd reached the beans shell → it was not abandoned.
      expect(shellCwds, 'healthy fleet must still be scanned').to.include(healthyWt)
      expect(shellCwds, 'broken fleet cwd must never reach beans').to.not.include('/does/not/exist/fleet-wt')
    })
  })

  describe('scanFleet: fleet merging detection (ms→primary tier 3)', () => {
    let db: Database.Database
    let wt: string

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      wt = join(tmpdir(), `hordr-merge-fleet-wt-${process.pid}-${Date.now()}`)
      mkdirSync(wt, {recursive: true})
    })

    afterEach(() => {
      _resetGitRunner()
      db.close()
    })

    it('picks up a merging fleet and sets conflict when merger exited but merge is not resolved', () => {
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        paneId: 'dead-pane-1',
        projectKey: 'pk1',
        status: 'merging',
        worktreePath: wt,
      })

      _setGitRunnerForTesting((() => {
        // git ops from restoreWorktree + finishFleetTeardown — shouldn't be
        // reached because isMergeComplete returns false (no real git repo).
      }) as GitRunner)

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      // Merger pane is dead (no herdr in test env → fetchPanes returns null),
      // isMergeComplete returns false (not a real git repo) → fleet → 'conflict'.
      expect(getFleet(db, 'pk1', 'ms1')!.status).to.equal('conflict')
    })

    it('jj: settles a resolved ms→base merge by moving the recorded base bookmark, then tears down', () => {
      registerFleet(db, {
        baseRef: 'develop',
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        paneId: null,
        projectKey: 'pk1',
        status: 'merging',
        worktreePath: wt,
      })

      const ops: string[] = []
      _setVcsForTesting({
        commitPending: () => false,
        deleteRef(o: {name: string}) {
          ops.push(`deleteRef:${o.name}`)
        },
        finalizeIntegration(o: {target?: string}) {
          ops.push(`finalize:${o.target ?? ''}`)
        },
        isIntegrationSettled: () => true,
        kind: 'jj',
        removeWorkspace(o: {name: string}) {
          ops.push(`remove:${o.name}`)
        },
      } as unknown as Vcs)

      try {
        createFleetEngine(config).scanFleet(db)

        expect(ops[0]).to.equal('finalize:develop')
        expect(ops).to.include('remove:ms/ms1')
        expect(getFleet(db, 'pk1', 'ms1')).to.be.undefined
      } finally {
        _setVcsForTesting(null)
      }
    })

    it('jj: a resolved merge with NO recorded base parks in conflict — never tears down (data-loss guard)', () => {
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        paneId: null,
        projectKey: 'pk1',
        status: 'merging',
        worktreePath: wt,
      })

      const ops: string[] = []
      _setVcsForTesting({
        commitPending: () => false,
        deleteRef() {
          ops.push('deleteRef')
        },
        finalizeIntegration() {
          ops.push('finalize')
        },
        isIntegrationSettled: () => true,
        kind: 'jj',
        removeWorkspace() {
          ops.push('remove')
        },
      } as unknown as Vcs)

      try {
        createFleetEngine(config).scanFleet(db)

        expect(ops).to.deep.equal([]) // no bookmark move, no teardown
        expect(getFleet(db, 'pk1', 'ms1')!.status).to.equal('conflict')
      } finally {
        _setVcsForTesting(null)
      }
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
        if (args[0] === 'show') {
          const id = args[2]
          // epic-a is still 'todo'; ms1 (milestone) is 'todo' too — sweep
          // precondition fires but epic-a is open so it must NOT mark ms1.
          return JSON.stringify({
            body: '',
            created_at: '',
            etag: 'e1',
            id,
            path: 'p',
            priority: 'normal',
            slug: id,
            status: 'todo',
            title: id,
            type: id === 'ms1' ? 'milestone' : 'epic',
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

  describe('scanFleet: milestone auto-completion (hordr-45f3, ADR-0015)', () => {
    let db: Database.Database
    let wt: string
    let beansShowCalls: string[]
    let beansUpdateCalls: string[]
    let dispatchQueryCalls: string[]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      wt = join(tmpdir(), `hordr-ms-completion-wt-${process.pid}-${Date.now()}`)
      mkdirSync(wt, {recursive: true})
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: wt,
      })
      beansShowCalls = []
      beansUpdateCalls = []
      dispatchQueryCalls = []
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      _resetGitRunner()
      db.close()
    })

    /**
     * Wire both module-level shell seams to the same dispatcher. Recognises:
     *  - beans show --json <id>          → getBean (beans/client.ts)
     *  - beans update <id> -s <status>   → markBeanCompleted / resetBeanToTodo (beans/client.ts)
     *  - beans list --ready --json       → fetchReady (dispatch.ts)
     *  - beans query --json '{ ... }'    → fetchEpics / fetchChildStatuses / fetchDescendants (dispatch.ts)
     */
    function wireShell(opts: {epicChildren: Array<{id: string; status: string}>; milestoneStatus: string}): void {
      const handler = (cmd: string, args: string[]): string => {
        // beans show --json <id>
        if (args[0] === 'show') {
          const id = args[2]
          beansShowCalls.push(id)
          const status = id === 'ms1' ? opts.milestoneStatus : 'completed'
          return JSON.stringify({
            body: '',
            created_at: '',
            etag: 'e1',
            id,
            path: 'p',
            priority: 'normal',
            slug: id,
            status,
            title: id,
            type: id === 'ms1' ? 'milestone' : 'epic',
            updated_at: '',
          })
        }

        // beans update <id> -s <status> — record, return success.
        if (args[0] === 'update') {
          beansUpdateCalls.push(args[1])
          return JSON.stringify({bean: {id: args[1], status: args[3]}, success: true})
        }

        // beans query --json '{ ... }'
        if (args[0] === 'query') {
          dispatchQueryCalls.push(args[2])
          // Distinguish fetchEpics (children { id title }) from
          // fetchChildStatuses (children { id status }) by inspecting query.
          const q = args[2] ?? ''
          if (q.includes('children { id status }')) {
            return JSON.stringify({bean: {children: opts.epicChildren}})
          }

          // fetchEpics + fetchDescendants (we don't care, return minimal).
          return JSON.stringify({bean: {children: []}})
        }

        if (args[0] === 'list') {
          return JSON.stringify([])
        }

        throw new Error(`unexpected beans call: ${cmd} ${args.join(' ')}`)
      }

      _setBeansShell(handler as unknown as BeansShellFn)
      // dispatch.ts ShellFn signature is (args, opts?) — adapt.
      _setShellForTesting(((args: string[], _opts?: {cwd?: string}) => handler('beans', args)) as ShellFn)
      // commitBeans runs real git — stub it out so we don't need a real repo.
      _setGitRunnerForTesting(((_args: string[], _opts?: {cwd?: string}) => '') as GitRunner)
    }

    it('marks the milestone completed when all epic children are completed (ports tick.ts:193-205)', () => {
      // No lanes, no ready work — only the fleet-level completion sweep can fire.
      wireShell({
        epicChildren: [
          {id: 'epic-a', status: 'completed'},
          {id: 'epic-b', status: 'completed'},
        ],
        milestoneStatus: 'todo', // not yet completed → sweep should fire
      })

      const engine = createFleetEngine(config)
      expect(() => engine.scanFleet(db)).to.not.throw()

      // Sweep must have fired: markBeanCompleted('ms1') routes through
      // beans/client.ts as `beans update ms1 -s completed`.
      expect(beansUpdateCalls, 'engine must call beans update <ms1> -s completed').to.include('ms1')
    })

    it('does NOT mark the milestone completed when any epic is still todo', () => {
      wireShell({
        epicChildren: [
          {id: 'epic-a', status: 'completed'},
          {id: 'epic-b', status: 'todo'}, // open work
        ],
        milestoneStatus: 'todo',
      })

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      // Sweep ran its precondition check but must NOT have marked the milestone.
      expect(beansUpdateCalls, 'no update should fire when an epic is still open').to.not.include('ms1')
    })
  })

  describe('scanFleet: cross-epic blocker refresh (hordr-lcsi)', () => {
    let db: Database.Database
    let msWt: string
    let laneWt: string
    let gitCalls: Array<{args: string[]; cwd: string}>

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      msWt = join(tmpdir(), `hordr-xepic-ms-${process.pid}-${Date.now()}`)
      laneWt = join(tmpdir(), `hordr-xepic-lane-${process.pid}-${Date.now()}`)
      mkdirSync(msWt, {recursive: true})
      mkdirSync(laneWt, {recursive: true})
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: msWt,
      })
      addLane(db, {
        branch: 'epic-a',
        createdAt: '2026-07-16T00:00:00Z',
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: 'ms1',
        paneId: 'p1',
        projectKey: 'pk1',
        status: 'active',
        workspaceId: 'ws1',
        worktreePath: laneWt,
      })
      gitCalls = []
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      _resetGitRunner()
      db.close()
    })

    /**
     * Dispatch shell mock — discriminates by cwd so the lane worktree reports
     * no ready work (stale) while the milestone worktree reports task-a ready.
     * That diff is the precondition for the cross-epic refresh.
     *
     * After the ff-merge call lands, the lane wt is considered refreshed —
     * subsequent `beans list --ready` from the lane wt also returns task-a.
     * This mirrors the real behavior (the merge pulls .beans/ forward).
     *
     * `msAlreadyMerged: true` simulates the lane-AHEAD state (hordr-48ao):
     * the ancestry probe succeeds, i.e. everything from ms is already in
     * the lane head and a refresh merge would be empty by construction.
     */
    function wireShell(opts: {msAlreadyMerged?: boolean; readyInMs: boolean}): {get mergedCalls(): number} {
      let mergedCalls = 0
      // beans/client.ts shell — getBean returns the epic as 'todo' regardless
      // of cwd (epic status is not affected by the staleness).
      _setBeansShell(((_cmd: string, args: string[]) => {
        const id = args[2]
        return JSON.stringify({
          body: '',
          created_at: '',
          etag: 'e1',
          id,
          path: 'p',
          priority: 'normal',
          slug: id,
          status: 'todo',
          title: id,
          type: id === 'ms1' ? 'milestone' : 'epic',
          updated_at: '',
        })
      }) as unknown as BeansShellFn)

      // dispatch.ts shell — list --ready / query, discriminates by cwd.
      _setShellForTesting(((args: string[], opts2?: {cwd?: string}) => {
        const cwd = opts2?.cwd ?? ''
        const inLane = cwd.includes('xepic-lane')
        const laneReady = inLane && mergedCalls > 0
        if (args[0] === 'list') {
          // fetchReady: empty in stale lane wt; one ready task in ms wt; and
          // in lane wt after the ff-merge completes.
          const showReady = opts.readyInMs && (!inLane || laneReady)
          return JSON.stringify(
            showReady ? [{id: 'task-a', priority: 'normal', status: 'todo', title: 'Task A', type: 'task'}] : [],
          )
        }

        if (args[0] === 'query') {
          const q = args[2] ?? ''
          if (q.includes('children { id status }')) {
            return JSON.stringify({bean: {children: [{id: 'epic-a', status: 'todo'}]}})
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
            },
          })
        }

        throw new Error(`unexpected dispatch call: ${args.join(' ')}`)
      }) as ShellFn)

      // git runner — record calls + count ff-merges (so the shell mock can
      // observe the refresh). The ancestry probe (`merge-base --is-ancestor`)
      // exits 1 — the runner throws — while ms is NOT in the lane head (the
      // normal lane-behind state); `msAlreadyMerged` flips it to exit 0.
      _setGitRunnerForTesting(((args: string[], opts2: {cwd: string}) => {
        gitCalls.push({args, cwd: opts2.cwd})
        if (args[0] === 'merge-base' && !opts.msAlreadyMerged) throw new Error('exit 1: not an ancestor')
        if (args[0] === 'merge' && args.includes('--ff-only')) mergedCalls++
      }) as GitRunner)

      return {
        get mergedCalls() {
          return mergedCalls
        },
      }
    }

    it('detects lane staleness via ms-vs-lane readiness diff and ff-merges ms into the lane', () => {
      wireShell({readyInMs: true})

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      const mergeCall = gitCalls.find((c) => c.args[0] === 'merge' && c.args.includes('--ff-only'))
      expect(mergeCall, 'engine must call git merge --ff-only to refresh the stale lane').to.not.equal(undefined)
      expect(mergeCall!.cwd, 'merge must run from inside the lane worktree').to.equal(laneWt)
      expect(mergeCall!.args, 'merge source must be the ms branch').to.include('ms/ms1')
    })

    it('does NOT merge when nothing is ready in ms either (no staleness)', () => {
      wireShell({readyInMs: false})

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      const mergeCall = gitCalls.find((c) => c.args[0] === 'merge' && c.args.includes('--ff-only'))
      expect(mergeCall, 'no merge should fire when nothing is ready upstream').to.equal(undefined)
    })

    it('skips the refresh merge when the ms head is already an ancestor of the lane head (hordr-48ao)', () => {
      // Lane-AHEAD: the lane completed a task ms has not merged back (the
      // epic→ms merge only fires when the whole epic completes), so ms still
      // reports it ready while the lane does not. That readiness diff must
      // NOT trigger a refresh merge — it pulls nothing (empty tree) and
      // would repeat every pass, accumulating junk changesets forever.
      wireShell({msAlreadyMerged: true, readyInMs: true})

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      const mergeCall = gitCalls.find((c) => c.args[0] === 'merge' && c.args.includes('--ff-only'))
      expect(mergeCall, 'lane-ahead must not trigger a refresh merge').to.equal(undefined)
      const lane = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-a')!
      expect(lane.status, 'lane stays active (idle) — work resumes when ms truly advances').to.equal('active')
    })

    it('skips the refresh merge when the lane worktree has uncommitted changes (clean-index guard)', () => {
      // The lane worktree must be a real git repo with an uncommitted file so
      // the engine's clean check (git status --porcelain) reports it dirty.
      // A dirty worktree must NOT be merged into — the merge would clobber
      // uncommitted work or spawn a merger on top of it.
      execFileSync('git', ['init', '-q', laneWt])
      execFileSync('git', ['-C', laneWt, 'config', 'user.email', 't@t'])
      execFileSync('git', ['-C', laneWt, 'config', 'user.name', 't'])
      writeFileSync(join(laneWt, 'dirty.txt'), 'uncommitted')
      const {mergedCalls} = wireShell({readyInMs: true})

      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      // No ff-merge fired (clean guard refused), no merger spawned.
      expect(mergedCalls, 'dirty lane must not be merged into').to.equal(0)
      const mergeCall = gitCalls.find((c) => c.args[0] === 'merge')
      expect(mergeCall, 'no merge call at all on a dirty lane worktree').to.equal(undefined)
      const lane = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-a')!
      expect(lane.status, 'lane stays active (not merging) — retry next pass').to.equal('active')
    })
  })

  describe('advanceLane: global concurrency cap (--max-lanes)', () => {
    let db: Database.Database

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-16T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: '/wt-ms1',
      })
      // One lane already has an agent in flight — it counts toward the cap.
      addLane(db, {
        branch: 'ep/running',
        createdAt: '2026-07-16T00:00:00Z',
        currentTaskBeanId: 'task-running',
        epicBeanId: 'epic-running',
        fleetMilestoneBeanId: 'ms1',
        paneId: 'p1',
        projectKey: 'pk1',
        status: 'active',
        workspaceId: 'ws1',
        worktreePath: '/wt-running',
      })
      // The idle lane we advance — it has ready work, so without a cap it
      // would dispatch (spawn an agent).
      addLane(db, {
        branch: 'ep/idle',
        createdAt: '2026-07-16T00:00:01Z',
        currentTaskBeanId: null,
        epicBeanId: 'epic-idle',
        fleetMilestoneBeanId: 'ms1',
        paneId: null,
        projectKey: 'pk1',
        status: 'active',
        workspaceId: null,
        worktreePath: '/wt-idle',
      })
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      db.close()
    })

    it('defers dispatch (returns idle) when the global cap is already reached', () => {
      _setShellForTesting(shellWithReadyWork())

      const fleet = getFleet(db, 'pk1', 'ms1')!
      const idleLane = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-idle')!

      // 1 agent already in flight; cap = 1 → gate blocks before any pane/spawn I/O.
      const engine = createFleetEngine(config, {maxLanes: 1})
      const res = engine.advanceLane(db, fleet, idleLane)

      expect(res.action).to.equal('idle')
      // Lane stayed idle — no task was dispatched.
      const after = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-idle')!
      expect(after.currentTaskBeanId).to.equal(null)
    })

    it('lets the lane through when under the cap (gate is the discriminator)', () => {
      _setShellForTesting(shellWithReadyWork())

      const fleet = getFleet(db, 'pk1', 'ms1')!
      const idleLane = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-idle')!

      // Under cap (1 in flight, cap = 5) → advanceLane proceeds PAST the gate
      // to ensureLanePane, which shells out to herdr/tmux. No real fleet
      // worktree/pane exists in this unit test, so it throws — proving the
      // gate did NOT short-circuit to idle the way it does at capacity.
      const engine = createFleetEngine(config, {maxLanes: 5})
      expect(() => engine.advanceLane(db, fleet, idleLane)).to.throw()
    })
  })

  describe('finishLaneTeardown: close herdr workspace after epic→ms merge', () => {
    let db: Database.Database
    let laneWt: string
    let paneShellCalls: string[][]
    let wtShellCalls: string[][]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      ensureProject(db, {beansPath: '/b', companyPath: null, configPath: '/c', projectKey: 'pk1'})
      const msWt = join(tmpdir(), `hordr-close-ms-${process.pid}-${Date.now()}`)
      laneWt = join(tmpdir(), `hordr-close-lane-${process.pid}-${Date.now()}`)
      mkdirSync(msWt, {recursive: true})
      mkdirSync(laneWt, {recursive: true})
      // dirtyNonBeansPaths shells out to real `git status` directly (no seam),
      // so the lane worktree must be a real, clean git repo to clear the
      // teardown gate (hordr-wd46).
      execFileSync('git', ['init', '-q', laneWt])

      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-07-29T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        status: 'active',
        worktreePath: msWt,
      })
      addLane(db, {
        branch: 'epic-a',
        createdAt: '2026-07-29T00:00:00Z',
        currentTaskBeanId: null,
        epicBeanId: 'epic-a',
        fleetMilestoneBeanId: 'ms1',
        paneId: 'p1',
        projectKey: 'pk1',
        status: 'active',
        workspaceId: 'ws-close',
        worktreePath: laneWt,
      })
      wtShellCalls = []
      paneShellCalls = []
      // pane shell: notify — capture the toast call, return a no-op result.
      _setPaneShellForTesting((args: string[]) => {
        paneShellCalls.push(args)
        return ''
      })

      // beans shell: epic-a is completed (→ mergeEpicLane fires); ms1 stays
      // active so milestone auto-completion doesn't fork into extra teardown.
      _setBeansShell(((cmd: string, args: string[]) => {
        if (cmd === 'update') return JSON.stringify({ok: true})
        const id = args[2]
        const isMs = id === 'ms1'
        return JSON.stringify({
          body: '',
          created_at: '',
          etag: 'e1',
          id,
          path: 'p',
          priority: 'normal',
          slug: id,
          status: isMs ? 'active' : 'completed',
          title: id,
          type: isMs ? 'milestone' : 'epic',
          updated_at: '',
        })
      }) as unknown as BeansShellFn)

      // dispatch shell: no ready work (idle lane) + epic subtree completed.
      _setShellForTesting(((args: string[]) => {
        if (args[0] === 'list') return JSON.stringify([])
        if (args[0] === 'query') return JSON.stringify({bean: {children: [{id: 'epic-a', status: 'completed'}]}})
        throw new Error(`unexpected dispatch call: ${args.join(' ')}`)
      }) as ShellFn)

      // runtime git: attemptMerge (stash/checkout/merge/restore) + branch -d
      // + commitBeans — all succeed silently.
      _setGitRunnerForTesting((() => {}) as GitRunner)
      // worktree git: removeWorktreeByPath — no-op under the seam.
      _setWtGitForTesting((() => {}) as WtGitShellFn)
      // worktree shell: closeWorkspace — capture the call, return success.
      _setWtShellForTesting(((args: string[]) => {
        wtShellCalls.push(args)
        return JSON.stringify({id: 'cli:workspace:close', result: {type: 'workspace_closed', workspace_id: 'ws-close'}})
      }) as WtShellFn)
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      _resetGitRunner()
      _resetWtGit()
      _resetWtShell()
      _resetPaneShell()
      db.close()
    })

    it('closes the lane herdr workspace (its tabs/panes) once the worktree+branch are removed', () => {
      const engine = createFleetEngine(config)
      engine.scanFleet(db)

      const closeCall = wtShellCalls.find((a) => a[0] === 'workspace' && a[1] === 'close')
      expect(closeCall, 'teardown must close the lane herdr workspace').to.not.equal(undefined)
      expect(closeCall).to.include('ws-close')

      const notifyCall = paneShellCalls.find((a) => a[0] === 'notification' && a[1] === 'show')
      // Toast: the merged lane (epic-a → ms1) was announced.
      expect(notifyCall, 'teardown must toast the merge').to.not.equal(undefined)
      expect(notifyCall).to.include('epic-a merged')

      // Teardown completed (not blocked on dirty worktree) → lane is done.
      const lane = listLanes(db, 'pk1', 'ms1').find((l) => l.epicBeanId === 'epic-a')!
      expect(lane.status).to.equal('done')
    })
  })

  describe('per-fleet config resolution: cwd-independent fleet check (hordr-c6ry)', () => {
    let db: Database.Database
    let projRoot: string
    let msWt: string
    let jjCalls: string[][]
    let wtCalls: string[][]

    beforeEach(() => {
      db = openDb(':memory:')
      applySchema(db)
      const stamp = `${process.pid}-${Date.now()}`
      projRoot = join(tmpdir(), `hordr-jjproj-${stamp}`)
      msWt = join(tmpdir(), `hordr-jjms-${stamp}`)
      mkdirSync(projRoot, {recursive: true})
      mkdirSync(msWt, {recursive: true})
      writeFileSync(join(projRoot, '.beans.yml'), 'hordr:\n  default_vcs: jj\n')

      ensureProject(db, {
        beansPath: projRoot,
        companyPath: null,
        configPath: join(projRoot, '.beans.yml'),
        projectKey: 'pk1',
      })
      registerFleet(db, {
        branch: 'ms/ms1',
        createdAt: '2026-09-02T00:00:00Z',
        milestoneBeanId: 'ms1',
        projectKey: 'pk1',
        projectRoot: projRoot,
        status: 'active',
        worktreePath: msWt,
      })

      jjCalls = []
      wtCalls = []
      // jj adapter shell: only the 'default' workspace exists; every other
      // invocation is a no-op probe (empty output ⇒ nothing pending/conflicted).
      _setJjShell((args: string[]) => {
        jjCalls.push(args)
        if (args[0] === 'workspace' && args[1] === 'list') return 'default: . abc123 000000 (empty)'
        return ''
      })
      // herdr shell: answer worktree create (git path) + workspace create (jj
      // adoption); everything else is a bug in the test's expectations.
      _setWtShellForTesting(((args: string[]) => {
        wtCalls.push(args)
        if (args[0] === 'worktree' && args[1] === 'create') {
          return JSON.stringify({result: {workspace_id: 'ws-git', worktree: {branch: 'epic-a', path: '/wt-epic-a'}}})
        }

        if (args[0] === 'workspace' && args[1] === 'create') {
          return JSON.stringify({result: {workspace: {workspace_id: 'ws-jj'}}})
        }

        throw new Error(`unexpected herdr call: ${args.join(' ')}`)
      }) as WtShellFn)
      _setPaneShellForTesting((args: string[]) => {
        if (args[0] === 'tab') return JSON.stringify({result: {root_pane: {pane_id: 'p-lane'}}})
        return ''
      })
      // dispatch shell: ready work ONLY in the ms worktree, so lane creation
      // fires but the fresh lane stays idle (no spawn machinery needed).
      _setShellForTesting(((args: string[], opts?: {cwd?: string}) => {
        const inMs = (opts?.cwd ?? '') === msWt
        if (args[0] === 'list') {
          return JSON.stringify(
            inMs ? [{id: 'task-a', priority: 'normal', status: 'todo', title: 'Task A', type: 'task'}] : [],
          )
        }

        if (args[0] === 'query') {
          // Milestone subtree → the epic; epic subtree → the ready task.
          const children = args.some((a) => a.includes('ms1'))
            ? [{id: 'epic-a', status: 'todo', title: 'Epic A', type: 'epic'}]
            : [{id: 'task-a', status: 'todo', title: 'Task A', type: 'task'}]
          return JSON.stringify({bean: {children}})
        }

        throw new Error(`unexpected dispatch call: ${args.join(' ')}`)
      }) as ShellFn)
      // beans client shell: epic-a todo, ms1 active, updates ok, subtrees empty.
      _setBeansShell(((cmd: string, args: string[]) => {
        if (cmd === 'update') return JSON.stringify({ok: true})
        if (cmd === 'query') {
          return JSON.stringify({bean: {children: args.includes('ms1') ? [{id: 'epic-a', status: 'todo'}] : []}})
        }

        const id = args.includes('ms1') ? 'ms1' : 'epic-a'
        return JSON.stringify({
          body: '',
          created_at: '',
          etag: 'e1',
          id,
          path: 'p',
          priority: 'normal',
          slug: id,
          status: id === 'ms1' ? 'active' : 'todo',
          title: id,
          type: id === 'ms1' ? 'milestone' : 'epic',
          updated_at: '',
        })
      }) as unknown as BeansShellFn)
      _setGitRunnerForTesting((() => '') as GitRunner)
      _setWtGitForTesting((() => {}) as WtGitShellFn)
    })

    afterEach(() => {
      _resetShell()
      _resetBeansShell()
      _resetGitRunner()
      _resetWtGit()
      _resetWtShell()
      _resetPaneShell()
      _resetJjShell()
      db.close()
    })

    it('creates the lane via the jj adapter when the fleet project says default_vcs: jj (engine invoked with git)', () => {
      const engine = createFleetEngine(config) // config.default_vcs === 'git'
      const res = engine.scanFleet(db)

      expect(res.lanesCreated).to.equal(1)
      const add = jjCalls.find((a) => a[0] === 'workspace' && a[1] === 'add')
      expect(add, 'lane working copy must be created via jj workspace add').to.not.equal(undefined)
      expect(add![add!.indexOf('--name') + 1]).to.equal('epic-a')
      expect(add![add!.indexOf('-r') + 1]).to.equal('ms/ms1')
      expect(
        wtCalls.find((a) => a[0] === 'worktree'),
        'herdr worktree create must NOT run for a jj fleet (not_git_worktree)',
      ).to.equal(undefined)
    })

    it('falls back to the invocation config (git adapter) when the project has no .beans.yml', () => {
      rmSync(join(projRoot, '.beans.yml'))

      const engine = createFleetEngine(config)
      const res = engine.scanFleet(db)

      expect(res.lanesCreated).to.equal(1)
      const create = wtCalls.find((a) => a[0] === 'worktree' && a[1] === 'create')
      expect(create, 'git fleet keeps herdr worktree create').to.not.equal(undefined)
      expect(create).to.include('--branch')
      expect(create![create!.indexOf('--branch') + 1]).to.equal('epic-a')
      // herdr rejects create/open from a linked worktree (linked_worktree_source):
      // --cwd must be the main repo checkout, not the ms integration worktree.
      expect(create![create!.indexOf('--cwd') + 1]).to.equal(projRoot)
      expect(jjCalls.length).to.equal(0)
    })
  })
})
