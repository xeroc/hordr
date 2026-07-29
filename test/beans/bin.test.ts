import {expect} from 'chai'

import {resolveBeansBin} from '../../src/beans/bin.js'

describe('beans/bin', () => {
  it('BEANS_BIN_PATH env var takes precedence', () => {
    const orig = process.env.BEANS_BIN_PATH
    process.env.BEANS_BIN_PATH = '/custom/beans'
    try {
      expect(resolveBeansBin()).to.equal('/custom/beans')
    } finally {
      if (orig === undefined) delete process.env.BEANS_BIN_PATH
      else process.env.BEANS_BIN_PATH = orig
    }
  })

  it('falls back to command -v beans when no env var', () => {
    const orig = process.env.BEANS_BIN_PATH
    delete process.env.BEANS_BIN_PATH
    try {
      const result = resolveBeansBin()
      // Either a resolved path (beans installed) or the 'beans' fallback
      expect(result).to.be.a('string').that.is.not.empty
    } finally {
      if (orig !== undefined) process.env.BEANS_BIN_PATH = orig
    }
  })
})
