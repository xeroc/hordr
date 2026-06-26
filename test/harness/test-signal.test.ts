import {expect} from 'chai'

import {detectTestSignal} from '../../src/harness/test-signal.js'
import {_resetShell as _resetPaneShell, _setShellForTesting as _setPaneShell} from '../../src/herdr/pane.js'

// detectTestSignal reads via readPane → _shell; mock the pane shell seam.
let output = ''
const mockPane = (): string => output

describe('harness/test-signal', () => {
  beforeEach(() => {
    output = ''
    _setPaneShell(mockPane)
  })

  afterEach(() => {
    _resetPaneShell()
  })

  const cases: Array<{expected: 'green' | 'red' | null; name: string; out: string}> = [
    {expected: 'green', name: 'green signal', out: 'tests passed\ntest-green\n'},
    {expected: 'red', name: 'red signal', out: 'FAIL\ntest-red\n'},
    {expected: null, name: 'no signal', out: 'no signal here'},
    {expected: 'red', name: 'both present is fail-safe red', out: 'test-green and test-red both appeared'},
    {expected: null, name: 'empty output', out: ''},
    {expected: null, name: 'case-sensitive: capitals not matched', out: 'TEST-GREEN'},
  ]

  for (const c of cases) {
    it(`${c.name} → ${JSON.stringify(c.expected)}`, () => {
      output = c.out
      expect(detectTestSignal('hordr-1503:tester')).to.equal(c.expected)
    })
  }
})
