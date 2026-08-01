import {expect} from 'chai'

import {fleetActionArgs, globalCheckArgs} from '../../src/tui/actions.js'

describe('tui/actions', () => {
  it('maps each fleet action to the matching `hordr fleet` argv', () => {
    expect(fleetActionArgs('status', 'ms-1')).to.deep.equal(['fleet', 'status', 'ms-1'])
    expect(fleetActionArgs('reset', 'ms-1')).to.deep.equal(['fleet', 'reset', 'ms-1'])
    expect(fleetActionArgs('finish', 'ms-1')).to.deep.equal(['fleet', 'finish', 'ms-1'])
    expect(fleetActionArgs('abort', 'ms-1')).to.deep.equal(['fleet', 'abort', 'ms-1'])
  })

  it('abort --force appends --force (mirrors the CLI)', () => {
    expect(fleetActionArgs('abort', 'ms-1', {force: true})).to.deep.equal([
      'fleet',
      'abort',
      'ms-1',
      '--force',
    ])
  })

  it('globalCheckArgs runs one broker pass (fleet check)', () => {
    expect(globalCheckArgs()).to.deep.equal(['fleet', 'check'])
  })

  it('rejects an unknown action at runtime', () => {
    // Cast bypasses the exhaustive union; the runtime guard must still throw.
    expect(() => fleetActionArgs('teleport' as never, 'ms-1')).to.throw(/unhandled fleet action/)
  })
})
