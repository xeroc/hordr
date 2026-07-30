import {expect} from 'chai'

import {decideRuntime} from '../../src/commands/tui.js'

describe('commands/tui decideRuntime', () => {
  it('blocks Bun (better-sqlite3 is unsupported there)', () => {
    expect(decideRuntime({bun: true, ffiFlag: true, major: 26, minor: 4})).to.equal('bun-blocked')
  })

  it('blocks node < 26.4 (no FFI capability)', () => {
    expect(decideRuntime({bun: false, ffiFlag: true, major: 26, minor: 2})).to.equal('node-too-old')
    expect(decideRuntime({bun: false, ffiFlag: true, major: 24, minor: 0})).to.equal('node-too-old')
  })

  it('requires the --experimental-ffi flag on node >= 26.4', () => {
    expect(decideRuntime({bun: false, ffiFlag: false, major: 26, minor: 4})).to.equal('needs-ffi-flag')
    expect(decideRuntime({bun: false, ffiFlag: false, major: 27, minor: 0})).to.equal('needs-ffi-flag')
  })

  it('proceeds on node >= 26.4 with the ffi flag', () => {
    expect(decideRuntime({bun: false, ffiFlag: true, major: 26, minor: 4})).to.equal('proceed')
    expect(decideRuntime({bun: false, ffiFlag: true, major: 27, minor: 1})).to.equal('proceed')
  })

  it('Bun is blocked even when the reported node-compat version is new', () => {
    expect(decideRuntime({bun: true, ffiFlag: true, major: 27, minor: 0})).to.equal('bun-blocked')
  })
})
