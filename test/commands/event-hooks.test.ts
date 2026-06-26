import {runCommand} from '@oclif/test'
/* eslint-disable camelcase -- RunState + herdr event payload fields use snake_case (workspace_id, started_unix, checkout_path) */
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import process from 'node:process'

import type {RunState} from '../../src/state/schema.js'

import {_resetShell as _resetBeansShell, _setShellForTesting as _setBeansShell} from '../../src/beans/client.js'
import {getRun, listRuns, putRun} from '../../src/state/run-store.js'

function makeRun(overrides: Partial<RunState> = {}): RunState {
  const now = Math.floor(Date.now() / 1000)
  return {
    bean: 'hordr-evt-1',
    panes: {},
    started_unix: now,
    status: 'running',
    step: 0,
    updated_unix: now,
    workflow: 'implement',
    worktree: null,
    ...overrides,
  }
}

interface EnvSnapshot {
  HERDR_PLUGIN_EVENT?: string
  HERDR_PLUGIN_EVENT_JSON?: string
  HERDR_PLUGIN_STATE_DIR?: string
}

let stateDir: string
let envSnapshot: EnvSnapshot

function snapshotEnv(): EnvSnapshot {
  return {
    HERDR_PLUGIN_EVENT: process.env.HERDR_PLUGIN_EVENT,
    HERDR_PLUGIN_EVENT_JSON: process.env.HERDR_PLUGIN_EVENT_JSON,
    HERDR_PLUGIN_STATE_DIR: process.env.HERDR_PLUGIN_STATE_DIR,
  }
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function setEvent(payload: object): void {
  process.env.HERDR_PLUGIN_EVENT_JSON = JSON.stringify(payload)
}

const CREATED_PAYLOAD = {
  data: {
    type: 'worktree_created',
    workspace: {
      label: 'hordr-evt-1',
      workspace_id: 'wNEW',
      worktree: {checkout_path: '/path/to/wt'},
    },
    worktree: {
      branch: 'bean/hordr-evt-1',
      label: 'hordr-evt-1',
      open_workspace_id: 'wNEW',
      path: '/path/to/wt',
    },
  },
  event: 'worktree_created',
}

const REMOVED_PAYLOAD = {
  data: {
    type: 'worktree_removed',
    workspace: {label: 'hordr-evt-1', workspace_id: 'wGONE'},
    worktree: {
      branch: 'bean/hordr-evt-1',
      label: 'hordr-evt-1',
      open_workspace_id: 'wGONE',
      path: '/path/to/wt',
    },
  },
  event: 'worktree_removed',
}

describe('event hooks (hordr-1702)', () => {
  describe('on-worktree-created event hook', () => {
    beforeEach(() => {
      stateDir = mkdtempSync(join(tmpdir(), 'hordr-evt-create-'))
      envSnapshot = snapshotEnv()
      process.env.HERDR_PLUGIN_STATE_DIR = stateDir
      // loadConfig walks up to find .beans.yml; we're inside the repo so it finds
      // the project's real manifest (which has worktree_branch_prefix: "bean/").
      // For determinism, chdir into the repo root (already the test cwd).
      _setBeansShell(() => '') // suppress any accidental beans calls
    })

    afterEach(() => {
      restoreEnv(envSnapshot)
      _resetBeansShell()
      rmSync(stateDir, {force: true, recursive: true})
    })

    it('updates Run worktree with workspace_id + path when branch matches prefix', async () => {
      putRun(makeRun({bean: 'hordr-evt-1'}))
      setEvent(CREATED_PAYLOAD)

      await runCommand('on-worktree-created')

      const run = getRun('hordr-evt-1')
      expect(run?.worktree).to.deep.equal({
        branch: 'bean/hordr-evt-1',
        path: '/path/to/wt',
        workspace_id: 'wNEW',
      })
    })

    it('is idempotent — re-firing the same event is a no-op', async () => {
      putRun(
        makeRun({
          bean: 'hordr-evt-1',
          worktree: {branch: 'bean/hordr-evt-1', path: '/path/to/wt', workspace_id: 'wNEW'},
        }),
      )
      setEvent(CREATED_PAYLOAD)

      await runCommand('on-worktree-created')

      const run = getRun('hordr-evt-1')
      // Unchanged.
      expect(run?.worktree?.workspace_id).to.equal('wNEW')
      expect(run?.worktree?.removed).to.not.equal(true)
    })

    it('skips silently when branch does not match the bean/ prefix', async () => {
      putRun(makeRun({bean: 'hordr-evt-1'}))
      setEvent({
        ...CREATED_PAYLOAD,
        data: {
          ...CREATED_PAYLOAD.data,
          worktree: {...CREATED_PAYLOAD.data.worktree, branch: 'feature/something-else'},
        },
      })

      await runCommand('on-worktree-created')

      const run = getRun('hordr-evt-1')
      expect(run?.worktree).to.be.null
    })

    it('skips when no Run exists for the bean id', async () => {
      // No putRun — no state to update.
      setEvent(CREATED_PAYLOAD)

      await runCommand('on-worktree-created')

      expect(listRuns()).to.have.length(0)
    })

    it('clears the removed tombstone when worktree is recreated', async () => {
      putRun(
        makeRun({
          bean: 'hordr-evt-1',
          worktree: {
            branch: 'bean/hordr-evt-1',
            path: '/old/path',
            removed: true,
            workspace_id: 'wOLD',
          },
        }),
      )
      setEvent(CREATED_PAYLOAD)

      await runCommand('on-worktree-created')

      const run = getRun('hordr-evt-1')
      expect(run?.worktree?.workspace_id).to.equal('wNEW')
      expect(run?.worktree?.removed).to.not.equal(true)
    })
  })

  describe('on-worktree-removed event hook', () => {
    beforeEach(() => {
      stateDir = mkdtempSync(join(tmpdir(), 'hordr-evt-remove-'))
      envSnapshot = snapshotEnv()
      process.env.HERDR_PLUGIN_STATE_DIR = stateDir
      _setBeansShell(() => '')
    })

    afterEach(() => {
      restoreEnv(envSnapshot)
      _resetBeansShell()
      rmSync(stateDir, {force: true, recursive: true})
    })

    it('marks the Run worktree as removed=true (preserving branch + workspace_id)', async () => {
      putRun(
        makeRun({
          bean: 'hordr-evt-1',
          status: 'pr-open',
          worktree: {branch: 'bean/hordr-evt-1', workspace_id: 'wGONE'},
        }),
      )
      setEvent(REMOVED_PAYLOAD)

      await runCommand('on-worktree-removed')

      const run = getRun('hordr-evt-1')
      expect(run?.worktree?.removed).to.equal(true)
      // Branch + workspace_id preserved for close-merged's gh pr view --branch lookup.
      expect(run?.worktree?.branch).to.equal('bean/hordr-evt-1')
      expect(run?.worktree?.workspace_id).to.equal('wGONE')
      // Run itself is preserved (close-merged will finalize once GitHub merges).
      expect(run?.status).to.equal('pr-open')
    })

    it('is idempotent — re-firing on an already-removed worktree is a no-op', async () => {
      putRun(
        makeRun({
          bean: 'hordr-evt-1',
          worktree: {branch: 'bean/hordr-evt-1', removed: true, workspace_id: 'wGONE'},
        }),
      )
      setEvent(REMOVED_PAYLOAD)

      const {stdout} = await runCommand('on-worktree-removed')

      expect(stdout).to.contain('no runs tracked') // second fire finds nothing to do
    })

    it('does not affect Runs in other workspaces', async () => {
      putRun(makeRun({bean: 'hordr-evt-1', worktree: {branch: 'bean/hordr-evt-1', workspace_id: 'wOTHER'}}))
      setEvent(REMOVED_PAYLOAD)

      await runCommand('on-worktree-removed')

      const run = getRun('hordr-evt-1')
      expect(run?.worktree?.removed).to.not.equal(true)
    })

    it('handles multiple Runs sharing the same workspace', async () => {
      putRun(makeRun({bean: 'hordr-evt-1', worktree: {branch: 'bean/hordr-evt-1', workspace_id: 'wSHARED'}}))
      const now = Math.floor(Date.now() / 1000)
      putRun({
        bean: 'hordr-evt-2',
        panes: {},
        started_unix: now,
        status: 'running',
        step: 0,
        updated_unix: now,
        workflow: 'implement',
        worktree: {branch: 'bean/hordr-evt-2', workspace_id: 'wSHARED'},
      })
      setEvent({
        ...REMOVED_PAYLOAD,
        data: {
          ...REMOVED_PAYLOAD.data,
          worktree: {...REMOVED_PAYLOAD.data.worktree, open_workspace_id: 'wSHARED'},
        },
      })

      await runCommand('on-worktree-removed')

      expect(getRun('hordr-evt-1')?.worktree?.removed).to.equal(true)
      expect(getRun('hordr-evt-2')?.worktree?.removed).to.equal(true)
    })

    it('skips when no Run references the removed workspace', async () => {
      setEvent(REMOVED_PAYLOAD)
      const {stdout} = await runCommand('on-worktree-removed')
      expect(stdout).to.contain('no runs tracked')
    })
  })
})
