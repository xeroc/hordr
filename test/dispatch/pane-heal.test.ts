/* eslint-disable camelcase -- PaneInfo/WorktreeInfo mirror herdr's snake_case JSON contract */
import {expect} from 'chai'

import type {PaneInfo} from '../../src/herdr/pane.js'
import type {WorktreeInfo} from '../../src/herdr/worktree.js'

import {ensureLanePane, type PaneHealDeps} from '../../src/dispatch/pane-heal.js'

const lane = {
  branch: 'tributary-s16v',
  epicBeanId: 'tributary-s16v',
  paneId: 'w84:p2' as null | string,
  workspaceId: 'w84' as null | string,
  worktreePath: '/wt/tributary-s16v',
}

const MAIN_REPO = '/repo/tributary'

describe('dispatch/pane-heal — ensureLanePane', () => {
  it('fast path: stored pane still alive → reuse it, no heal', () => {
    const deps: PaneHealDeps = {
      createTab() {
        throw new Error('createTab must not be called when the pane is alive')
      },
      openWorktree() {
        throw new Error('openWorktree must not be called when the pane is alive')
      },
      paneExists: (id) => id === 'w84:p2',
    }

    const result = ensureLanePane(lane, MAIN_REPO, deps)

    expect(result.healed).to.equal(false)
    expect(result.paneId).to.equal('w84:p2')
    expect(result.workspaceId).to.equal(undefined)
  })

  it('pane dead, workspace alive → create a fresh tab, no heal', () => {
    const created: PaneInfo = {pane_id: 'w84:p9', tab_id: 'w84:t9', workspace_id: 'w84'}
    const deps: PaneHealDeps = {
      createTab(opts) {
        expect(opts.workspaceId, 'must reuse the stored workspace').to.equal('w84')
        expect(opts.label).to.equal('hordr:tributary-s16v')
        expect(opts.cwd).to.equal('/wt/tributary-s16v')
        return created
      },
      openWorktree() {
        throw new Error('openWorktree must not be called when only the pane is dead')
      },
      paneExists: () => false,
    }

    const result = ensureLanePane(lane, MAIN_REPO, deps)

    expect(result.healed).to.equal(false)
    expect(result.paneId).to.equal('w84:p9')
    expect(result.workspaceId).to.equal(undefined)
  })

  it('workspace dead (workspace_not_found) → reattach worktree to a fresh workspace, then create the tab (heal)', () => {
    const reopened: WorktreeInfo = {
      branch: 'tributary-s16v',
      path: '/wt/tributary-s16v',
      workspace_id: 'w99',
    }
    const created: PaneInfo = {pane_id: 'w99:p1', tab_id: 'w99:t1', workspace_id: 'w99'}
    let openOpts: undefined | {branch?: string; cwd?: string}
    const deps: PaneHealDeps = {
      createTab(opts) {
        // After heal, the tab must land in the NEW workspace, not the stale one.
        expect(opts.workspaceId, 'post-heal createTab must use the reopened workspace').to.equal('w99')
        return created
      },
      openWorktree(opts) {
        openOpts = opts
        return reopened
      },
      paneExists: () => false,
    }
    // createTab first throws the exact shape herdr produces for a dead workspace.
    const originalCreateTab = deps.createTab
    let createTabCalls = 0
    deps.createTab = (opts) => {
      createTabCalls++
      if (createTabCalls === 1) {
        throw new Error(
          'herdr command failed: herdr tab create --workspace w84 --cwd /wt/tributary-s16v\n' +
            '{"error":{"code":"workspace_not_found","message":"workspace w84 not found"}}',
        )
      }

      return originalCreateTab(opts)
    }

    const result = ensureLanePane(lane, MAIN_REPO, deps)

    expect(createTabCalls, 'createTab must be called twice (stale then healed)').to.equal(2)
    expect(openOpts, 'openWorktree must reattach by branch from the main repo').to.deep.equal({
      branch: 'tributary-s16v',
      cwd: MAIN_REPO,
    })
    expect(result.healed).to.equal(true)
    expect(result.paneId).to.equal('w99:p1')
    expect(result.workspaceId, 'must surface the new workspace id to persist').to.equal('w99')
  })

  it('createTab fails for any other reason → rethrow (no swallow, no heal)', () => {
    const deps: PaneHealDeps = {
      createTab() {
        throw new Error('herdr tab create failed: {"error":{"code":"label_invalid"}}')
      },
      openWorktree() {
        throw new Error('openWorktree must not be called for unrelated failures')
      },
      paneExists: () => false,
    }

    expect(() => ensureLanePane(lane, MAIN_REPO, deps)).to.throw(/label_invalid/)
  })

  it('null pane + null workspace → creates a tab against the empty workspace id (no heal unless workspace_not_found)', () => {
    const created: PaneInfo = {pane_id: 'w10:p1', workspace_id: 'w10'}
    const deps: PaneHealDeps = {
      createTab(opts) {
        expect(opts.workspaceId).to.equal('')
        return created
      },
      openWorktree() {
        throw new Error('openWorktree must not be called when createTab succeeds')
      },
      paneExists: () => false,
    }

    const result = ensureLanePane({...lane, paneId: null, workspaceId: null}, MAIN_REPO, deps)

    expect(result.healed).to.equal(false)
    expect(result.paneId).to.equal('w10:p1')
  })
})
