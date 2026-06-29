/* eslint-disable camelcase -- mirrors RunState's snake_case JSON contract */
import {expect} from 'chai'

import type {EngineDeps} from '../../../src/engine/types.js'

import {launchOrReuse, StepError} from '../../../src/engine/steps/shared.js'
import {makeRun} from '../helpers.js'

const deps: EngineDeps = {
  createWorktree: () => ({branch: 'bean/x', workspaceId: 'wX'}),
  launchAgent: () => ({paneLabel: 'wX:p1'}),
  paneExists: () => false,
  removeWorktree() {},
}

describe('engine/steps/shared / launchOrReuse (single-pane-per-run model)', () => {
  it('throws a clear StepError when run.worktree is null', () => {
    const run = makeRun({worktree: null})

    expect(() => launchOrReuse(run, 'implementer', deps)).to.throw(
      StepError,
      /no worktree for bean .* \(workflow '.*' must set worktree: true\)/,
    )
  })

  it('spawns into panes.primary and returns paneStep=run.step when no pane exists yet', () => {
    const run = makeRun({bean: 'b1', panes: {}, step: 0})
    const result = launchOrReuse(run, 'implementer', deps)

    expect(result.label).to.equal('wX:p1')
    expect(result.panes).to.deep.equal({primary: 'wX:p1'})
    expect(result.paneStep).to.equal(0)
  })

  it('reuses panes.primary when pane exists AND pane_step matches current step (advance callback)', () => {
    const run = makeRun({
      bean: 'b1',
      pane_step: 0,
      panes: {primary: 'wX:p1'},
      step: 0,
    })
    const result = launchOrReuse(run, 'implementer', {...deps, paneExists: () => true})

    // No spawn happened — same label, no paneStep in result.
    expect(result.label).to.equal('wX:p1')
    expect(result.panes).to.deep.equal({primary: 'wX:p1'})
    expect(result.paneStep).to.be.undefined
  })

  it('respawns when pane_step !== current step (workflow advanced to a new role)', () => {
    const run = makeRun({
      bean: 'b1',
      pane_step: 0, // pane is still on implementer's step
      panes: {primary: 'wX:p1'},
      step: 1, // workflow advanced to tester
    })
    const result = launchOrReuse(run, 'tester', {...deps, paneExists: () => true})

    expect(result.label).to.equal('wX:p1')
    expect(result.panes).to.deep.equal({primary: 'wX:p1'})
    expect(result.paneStep).to.equal(1)
  })

  it('respawns when the pane has died (deps.paneExists=false) even if pane_step matched', () => {
    const run = makeRun({
      bean: 'b1',
      pane_step: 0,
      panes: {primary: 'wX:p1'},
      step: 0,
    })
    const result = launchOrReuse(run, 'implementer', deps) // paneExists=false

    expect(result.paneStep).to.equal(0) // spawned fresh
  })

  it('passes existingPaneId on step transition so launcher reuses the tab (no new tab)', () => {
    const captured: Array<{existingPaneId?: string; role: string}> = []
    const run = makeRun({
      bean: 'b1',
      pane_step: 0,
      panes: {primary: 'wX:p1'},
      step: 1,
    })
    launchOrReuse(run, 'tester', {
      ...deps,
      launchAgent(opts) {
        captured.push({existingPaneId: opts.existingPaneId, role: opts.role})
        return {paneLabel: opts.existingPaneId ?? 'wX:pNEW'}
      },
      paneExists: () => true,
    })

    expect(captured).to.have.length(1)
    expect(captured[0].existingPaneId).to.equal('wX:p1') // reused, not new
    expect(captured[0].role).to.equal('tester')
  })

  it('does NOT pass existingPaneId when pane is dead (launcher must createTab)', () => {
    const captured: Array<{existingPaneId?: string}> = []
    const run = makeRun({
      bean: 'b1',
      pane_step: 0,
      panes: {primary: 'wX:p1'},
      step: 1,
    })
    launchOrReuse(run, 'tester', {
      ...deps,
      launchAgent(opts) {
        captured.push({existingPaneId: opts.existingPaneId})
        return {paneLabel: 'wX:pNEW'}
      },
      paneExists: () => false, // pane died
    })

    expect(captured[0].existingPaneId).to.be.undefined
  })
})
